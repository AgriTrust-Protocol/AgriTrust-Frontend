/**
 * Browser structured logging aligned to the OpenTelemetry Logs data model.
 *
 * The logger deliberately avoids recording credentials, wallet addresses, and
 * request payloads. Collectors can correlate records using W3C trace context
 * when a traceparent has been provided by the application or upstream API.
 */
export type LogSeverity = "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";
export type LogAttributes = Record<string, unknown>;

export interface TraceContext {
  traceId: string;
  spanId: string;
  traceFlags?: string;
}

export interface OTelLogRecord {
  timestamp: string;
  observedTimestamp: string;
  severityText: LogSeverity;
  body: string;
  attributes: LogAttributes;
  resource: LogAttributes;
  traceId?: string;
  spanId?: string;
  traceFlags?: string;
}

export interface LogSink {
  emit(records: OTelLogRecord[]): void | Promise<void>;
}

export interface LoggerOptions {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  sink?: LogSink;
  now?: () => Date;
  traceContext?: () => TraceContext | undefined;
}

const SENSITIVE_KEY = /authorization|cookie|token|secret|password|private.?key|^(?:wallet|account)(?:[._-]?address)?$/i;
const MAX_ATTRIBUTE_DEPTH = 4;
const MAX_STRING_LENGTH = 512;

function sanitize(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.slice(0, MAX_STRING_LENGTH);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (value instanceof Error) return { "error.type": value.name, "error.message": value.message.slice(0, MAX_STRING_LENGTH) };
  if (Array.isArray(value)) return depth >= MAX_ATTRIBUTE_DEPTH ? "[truncated]" : value.slice(0, 20).map((item) => sanitize(item, depth + 1));
  if (typeof value === "object") {
    if (depth >= MAX_ATTRIBUTE_DEPTH) return "[truncated]";
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? "[redacted]" : sanitize(item, depth + 1)]));
  }
  return String(value);
}

export function parseTraceparent(value: string | null | undefined): TraceContext | undefined {
  if (!value) return undefined;
  const match = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i.exec(value);
  if (!match || /^0+$/.test(match[1]) || /^0+$/.test(match[2])) return undefined;
  return { traceId: match[1], spanId: match[2], traceFlags: match[3] };
}

class HttpLogSink implements LogSink {
  constructor(private readonly endpoint: string) {}

  emit(records: OTelLogRecord[]): void {
    const body = JSON.stringify({ resourceLogs: records });
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function" && body.length < 60_000) {
      navigator.sendBeacon(this.endpoint, new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch(this.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
  }
}

function defaultSink(): LogSink | undefined {
  const endpoint = process.env.NEXT_PUBLIC_OTEL_LOGS_ENDPOINT;
  return endpoint ? new HttpLogSink(endpoint) : undefined;
}

export class StructuredLogger {
  private readonly sink: LogSink | undefined;
  private readonly now: () => Date;
  private readonly resource: LogAttributes;

  constructor(private readonly options: LoggerOptions) {
    this.sink = options.sink ?? defaultSink();
    this.now = options.now ?? (() => new Date());
    this.resource = {
      "service.name": options.serviceName,
      "service.version": options.serviceVersion ?? process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
      "deployment.environment.name": options.environment ?? process.env.NEXT_PUBLIC_DEPLOYMENT_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
      "telemetry.sdk.language": "webjs",
    };
  }

  log(severityText: LogSeverity, body: string, attributes: LogAttributes = {}, error?: unknown, traceContext?: TraceContext): void {
    const timestamp = this.now().toISOString();
    const trace = traceContext ?? this.options.traceContext?.();
    const safeAttributes = sanitize({ ...attributes, ...(error ? { error } : {}) }) as LogAttributes;
    const record: OTelLogRecord = {
      timestamp,
      observedTimestamp: timestamp,
      severityText,
      body: body.slice(0, MAX_STRING_LENGTH),
      attributes: safeAttributes,
      resource: this.resource,
      ...(trace && { traceId: trace.traceId, spanId: trace.spanId, traceFlags: trace.traceFlags }),
    };
    this.sink?.emit([record]);
    if (process.env.NODE_ENV !== "production") {
      const consoleMethod = severityText === "ERROR" || severityText === "FATAL" ? console.error : severityText === "WARN" ? console.warn : console.info;
      consoleMethod(JSON.stringify(record));
    }
  }

  debug(body: string, attributes?: LogAttributes): void { this.log("DEBUG", body, attributes); }
  info(body: string, attributes?: LogAttributes): void { this.log("INFO", body, attributes); }
  warn(body: string, attributes?: LogAttributes, error?: unknown): void { this.log("WARN", body, attributes, error); }
  error(body: string, attributes?: LogAttributes, error?: unknown): void { this.log("ERROR", body, attributes, error); }
}

let appLogger: StructuredLogger | undefined;
export function getLogger(): StructuredLogger {
  appLogger ??= new StructuredLogger({ serviceName: "agritrust-frontend" });
  return appLogger;
}
