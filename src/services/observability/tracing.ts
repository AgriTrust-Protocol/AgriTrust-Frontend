/**
 * Lightweight browser OpenTelemetry implementation.
 *
 * It emits OTLP/JSON spans and propagates the W3C Trace Context headers without
 * collecting request bodies, query strings, wallet addresses, or error text.
 * Keeping this adapter dependency-free also means tracing cannot increase the
 * critical-path bundle with a second telemetry SDK.
 */

export interface TraceContext {
  traceId: string;
  spanId: string;
  traceFlags: string;
  traceState?: string;
}

interface Span {
  name: string;
  context: TraceContext;
  parentSpanId?: string;
  startTimeUnixNano: string;
  endTimeUnixNano?: string;
  attributes: Record<string, string | number | boolean>;
  status?: { code: number; message?: string };
}

export function recordSpan(
  name: string,
  context: TraceContext,
  attributes: Record<string, string | number | boolean>,
  errorMessage?: string,
): void {
  enqueue({
    name,
    context,
    startTimeUnixNano: nowUnixNano(),
    endTimeUnixNano: nowUnixNano(),
    attributes,
    ...(errorMessage ? { status: { code: 2, message: errorMessage } } : { status: { code: 1 } }),
  });
}

const TRACEPARENT = "traceparent";
const TRACESTATE = "tracestate";
const MAX_QUEUE_SIZE = 200;
const FLUSH_INTERVAL_MS = 5_000;
let initialized = false;
let originalFetch: typeof window.fetch | undefined;
let pageContext: TraceContext | undefined;
let queue: Span[] = [];
let flushTimer: number | undefined;

function randomHex(bytes: number): string {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
}

function isValidId(value: string, length: number): boolean {
  return new RegExp(`^[0-9a-f]{${length}}$`, "i").test(value) && !/^0+$/.test(value);
}

/** Parses a valid W3C traceparent header, returning undefined for untrusted input. */
export function parseTraceparent(value: string | null): TraceContext | undefined {
  if (!value) return undefined;
  const [version, traceId, spanId, traceFlags] = value.trim().split("-");
  if (
    version !== "00" ||
    !isValidId(traceId ?? "", 32) ||
    !isValidId(spanId ?? "", 16) ||
    !/^[0-9a-f]{2}$/i.test(traceFlags ?? "")
  ) {
    return undefined;
  }
  return { traceId: traceId!.toLowerCase(), spanId: spanId!.toLowerCase(), traceFlags: traceFlags!.toLowerCase() };
}

export function formatTraceparent(context: TraceContext): string {
  return `00-${context.traceId}-${context.spanId}-${context.traceFlags}`;
}

export function createTraceContext(parent?: TraceContext): TraceContext {
  return {
    traceId: parent?.traceId ?? randomHex(16),
    spanId: randomHex(8),
    traceFlags: parent?.traceFlags ?? "01",
    ...(parent?.traceState ? { traceState: parent.traceState } : {}),
  };
}

function endpoint(): string | undefined {
  const value = process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  return value && /^https:\/\//.test(value) ? value : undefined;
}

function propagationOrigins(): string[] {
  const configured = process.env.NEXT_PUBLIC_TRACE_PROPAGATION_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];
  return typeof window === "undefined" ? configured : [window.location.origin, ...configured];
}

/** Only inject headers into explicitly trusted HTTPS origins (or this app's origin). */
export function shouldPropagateTrace(url: string, origins: string[] = propagationOrigins()): boolean {
  try {
    const target = new URL(url, typeof window === "undefined" ? "https://invalid.local" : window.location.origin);
    return (target.protocol === "https:" || target.origin === window.location.origin) && origins.includes(target.origin);
  } catch {
    return false;
  }
}

function nowUnixNano(): string {
  return String(BigInt(Date.now()) * 1_000_000n + BigInt(Math.round((performance.now() % 1) * 1_000_000)));
}

function sanitizedUrl(input: RequestInfo | URL): string {
  const value = input instanceof Request ? input.url : input.toString();
  try {
    const parsed = new URL(value, window.location.origin);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "invalid-url";
  }
}

function enqueue(span: Span): void {
  if (!endpoint()) return;
  if (queue.length >= MAX_QUEUE_SIZE) queue.shift();
  queue.push(span);
}

function otlpPayload(spans: Span[]) {
  return {
    resourceSpans: [{
      resource: { attributes: [{ key: "service.name", value: { stringValue: "agritrust-frontend" } }] },
      scopeSpans: [{ scope: { name: "agritrust.browser", version: "1.0.0" }, spans: spans.map((span) => ({
        name: span.name,
        traceId: span.context.traceId,
        spanId: span.context.spanId,
        ...(span.parentSpanId ? { parentSpanId: span.parentSpanId } : {}),
        startTimeUnixNano: span.startTimeUnixNano,
        endTimeUnixNano: span.endTimeUnixNano ?? nowUnixNano(),
        attributes: Object.entries(span.attributes).map(([key, value]) => ({ key, value: typeof value === "string" ? { stringValue: value } : typeof value === "boolean" ? { boolValue: value } : { intValue: String(value) } })),
        ...(span.status ? { status: span.status } : {}),
      })) }],
    }],
  };
}

export function flushTracing(): void {
  const collector = endpoint();
  if (!collector || queue.length === 0 || !originalFetch) return;
  const spans = queue.splice(0, queue.length);
  const payload = JSON.stringify(otlpPayload(spans));
  void originalFetch(collector, {
    method: "POST",
    body: payload,
    headers: { "content-type": "application/json" },
    keepalive: true,
    credentials: "omit",
  }).catch(() => {
    // Telemetry must never affect user requests. Discard failed exports to avoid retry storms.
  });
}

function instrumentFetch(): void {
  if (!originalFetch) return;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const requestUrl = input instanceof Request ? input.url : input.toString();
    if (requestUrl === endpoint() || !shouldPropagateTrace(requestUrl)) return originalFetch!(input, init);

    const inherited = init?.headers ? new Headers(init.headers) : input instanceof Request ? new Headers(input.headers) : new Headers();
    const parent = parseTraceparent(inherited.get(TRACEPARENT)) ?? pageContext;
    const context = createTraceContext(parent);
    if (!inherited.has(TRACEPARENT)) inherited.set(TRACEPARENT, formatTraceparent(context));
    if (context.traceState && !inherited.has(TRACESTATE)) inherited.set(TRACESTATE, context.traceState);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const span: Span = { name: `HTTP ${method.toUpperCase()}`, context, parentSpanId: parent?.spanId, startTimeUnixNano: nowUnixNano(), attributes: { "http.request.method": method.toUpperCase(), "url.full": sanitizedUrl(input) } };
    try {
      const response = await originalFetch!(input, { ...init, headers: inherited });
      span.attributes["http.response.status_code"] = response.status;
      span.status = { code: response.ok ? 1 : 2 };
      return response;
    } catch (error) {
      span.status = { code: 2, message: error instanceof Error ? error.name : "fetch-error" };
      throw error;
    } finally {
      span.endTimeUnixNano = nowUnixNano();
      enqueue(span);
    }
  };
}

/** Starts browser instrumentation once; a missing collector disables exporting, not propagation. */
export function initializeTracing(): void {
  if (initialized || typeof window === "undefined" || !window.crypto?.getRandomValues) return;
  initialized = true;
  originalFetch = window.fetch.bind(window);
  pageContext = createTraceContext();
  instrumentFetch();
  flushTimer = window.setInterval(flushTracing, FLUSH_INTERVAL_MS);
  window.addEventListener("pagehide", flushTracing);
}

/** Test-only cleanup and a safe lifecycle hook for embedded application shells. */
export function shutdownTracing(): void {
  flushTracing();
  if (originalFetch) window.fetch = originalFetch;
  if (flushTimer) window.clearInterval(flushTimer);
  window.removeEventListener("pagehide", flushTracing);
  flushTimer = undefined;
  initialized = false;
  originalFetch = undefined;
  pageContext = undefined;
  queue = [];
}
