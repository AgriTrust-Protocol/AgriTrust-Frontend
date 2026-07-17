import type {
  WebhookAttempt,
  WebhookDeliveryRequest,
  WebhookDeliveryResult,
  WebhookMetric,
} from "@/src/types/webhooks";
import { WEBHOOK_SIGNATURE_VERSION } from "@/src/types/webhooks";

const encoder = new TextEncoder();
const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429]);

export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  /** 0 disables jitter; 1 randomizes the full delay window. */
  jitter: number;
}

export const DEFAULT_WEBHOOK_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 5,
  initialDelayMs: 250,
  maxDelayMs: 30_000,
  jitter: 0.2,
};

export interface WebhookDeliveryOptions {
  retry?: Partial<RetryPolicy>;
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  onMetric?: (metric: WebhookMetric) => void;
  /** Apply the backend endpoint allow-list after the baseline URL checks. */
  isAllowedEndpoint?: (url: URL) => boolean;
}

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Web Crypto SubtleCrypto is unavailable");
  return subtle;
}

/**
 * Produces stable JSON so the payload that is signed is exactly the payload
 * sent. Object keys are sorted recursively; arrays preserve their order.
 */
export function canonicalJson(value: unknown): string {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    throw new TypeError("Webhook payload contains a value that cannot be represented in JSON");
  }
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new TypeError("Webhook payload cannot be represented in JSON");
    return serialized;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

/** Builds the replay-resistant message covered by an HMAC signature. */
export function webhookSigningPayload(
  timestamp: string,
  deliveryId: string,
  body: string
): string {
  return `${WEBHOOK_SIGNATURE_VERSION}.${timestamp}.${deliveryId}.${body}`;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  return Uint8Array.from(hex.match(/.{2}/g)!, (pair) => parseInt(pair, 16));
}

/** Signs a canonical webhook payload using HMAC-SHA-256. Server-only. */
export async function signWebhookPayload(
  secret: string,
  timestamp: string,
  deliveryId: string,
  body: string
): Promise<string> {
  const key = await getSubtle().importKey(
    "raw",
    encoder.encode(secret) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await getSubtle().sign(
    "HMAC",
    key,
    encoder.encode(webhookSigningPayload(timestamp, deliveryId, body)) as BufferSource
  );
  return `sha256=${bytesToHex(new Uint8Array(signature))}`;
}

/**
 * Constant-time HMAC verification for recipients. A timestamp window prevents
 * a captured valid delivery from being replayed indefinitely.
 */
export async function verifyWebhookSignature(options: {
  secret: string;
  timestamp: string;
  deliveryId: string;
  body: string;
  signature: string | null;
  toleranceMs?: number;
  now?: () => number;
}): Promise<boolean> {
  const timestampMs = Date.parse(options.timestamp);
  const now = (options.now ?? Date.now)();
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > (options.toleranceMs ?? 300_000)) {
    return false;
  }
  if (!options.signature?.startsWith("sha256=")) return false;

  const expected = await signWebhookPayload(options.secret, options.timestamp, options.deliveryId, options.body);
  const actualBytes = hexToBytes(options.signature.slice("sha256=".length));
  const expectedBytes = hexToBytes(expected.slice("sha256=".length));
  if (!actualBytes || !expectedBytes || actualBytes.length !== expectedBytes.length) return false;

  let difference = 0;
  for (let index = 0; index < actualBytes.length; index += 1) difference |= actualBytes[index] ^ expectedBytes[index];
  return difference === 0;
}

export function retryDelayMs(
  attemptNumber: number,
  policy: RetryPolicy,
  random: () => number = Math.random
): number {
  const base = Math.min(policy.maxDelayMs, policy.initialDelayMs * 2 ** (attemptNumber - 1));
  return Math.round(base * (1 - policy.jitter + random() * policy.jitter * 2));
}

/**
 * Rejects URL forms that are unsafe for a server-side dispatcher. Production
 * callers must additionally apply an endpoint allow-list and DNS egress rules.
 */
export function isSafeWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "::1" || host.endsWith(".local")) return false;
    if (/^127\.|^10\.|^0\.|^169\.254\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function responseRetryDelay(response: Response, fallback: number, now: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (!retryAfter) return fallback;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(retryAfter);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - now) : fallback;
}

function isRetryable(status: number): boolean {
  return status >= 500 || RETRYABLE_STATUS_CODES.has(status);
}

/**
 * Delivers a signed event with bounded exponential backoff. This class is
 * deliberately server-only: its signing secret must remain in a secret store.
 */
export class WebhookDeliveryService {
  private readonly options: Required<Pick<WebhookDeliveryOptions, "fetch" | "sleep" | "random" | "now">> & WebhookDeliveryOptions;
  private readonly policy: RetryPolicy;

  constructor(options: WebhookDeliveryOptions = {}) {
    if (!options.fetch && typeof fetch === "undefined") throw new Error("fetch is unavailable");
    this.options = {
      ...options,
      fetch: options.fetch ?? fetch,
      sleep: options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))),
      random: options.random ?? Math.random,
      now: options.now ?? Date.now,
    };
    this.policy = { ...DEFAULT_WEBHOOK_RETRY_POLICY, ...options.retry };
    if (this.policy.maxAttempts < 1) throw new Error("maxAttempts must be at least 1");
  }

  async deliver<T>(request: WebhookDeliveryRequest<T>, secret: string): Promise<WebhookDeliveryResult> {
    const endpoint = new URL(request.url);
    if (!isSafeWebhookUrl(request.url) || this.options.isAllowedEndpoint?.(endpoint) === false) {
      throw new Error("Webhook endpoint is not allowed");
    }
    const deliveryId = globalThis.crypto.randomUUID();
    const body = canonicalJson(request.event);
    const timestamp = new Date(this.options.now()).toISOString();
    const signature = await signWebhookPayload(secret, timestamp, deliveryId, body);
    const attempts: WebhookAttempt[] = [];

    for (let number = 1; number <= this.policy.maxAttempts; number += 1) {
      const startedAt = this.options.now();
      let response: Response | undefined;
      let error: unknown;
      try {
        response = await this.options.fetch(request.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": request.event.id,
            "webhook-delivery-id": deliveryId,
            "webhook-key-id": request.signingKeyId,
            "webhook-signature": signature,
            "webhook-timestamp": timestamp,
          },
          body,
        });
      } catch (caught) {
        error = caught;
      }
      const durationMs = this.options.now() - startedAt;
      const success = response?.ok ?? false;
      const retryable = !success && (!response || isRetryable(response.status));
      const canRetry = retryable && number < this.policy.maxAttempts;
      const fallbackDelay = retryDelayMs(number, this.policy, this.options.random);
      const delay = response && canRetry ? responseRetryDelay(response, fallbackDelay, this.options.now()) : fallbackDelay;
      const attempt: WebhookAttempt = {
        number,
        status: response?.status,
        error: error instanceof Error ? error.message : undefined,
        durationMs,
        nextRetryAt: canRetry ? new Date(this.options.now() + delay).toISOString() : undefined,
      };
      attempts.push(attempt);
      this.options.onMetric?.({ name: "webhook_delivery_attempt", value: 1, tags: { status: response?.status ?? "network_error", success, attempt: number } });

      if (success || !canRetry) {
        this.options.onMetric?.({ name: "webhook_delivery_completed", value: 1, tags: { success, attempts: number } });
        return { deliveryId, eventId: request.event.id, success, attempts };
      }
      await this.options.sleep(delay);
    }
    throw new Error("Webhook delivery loop exited unexpectedly");
  }
}
