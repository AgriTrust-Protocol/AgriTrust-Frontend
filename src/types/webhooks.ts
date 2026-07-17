/** The versioned signature contract used for AgriTrust webhook deliveries. */
export const WEBHOOK_SIGNATURE_VERSION = "v1";

export interface WebhookEvent<T = unknown> {
  /** Globally unique event id; recipients must use it as their idempotency key. */
  id: string;
  type: string;
  occurredAt: string;
  data: T;
}

export interface WebhookDeliveryRequest<T = unknown> {
  event: WebhookEvent<T>;
  url: string;
  /** A server-provided opaque key reference. Never put a signing secret here. */
  signingKeyId: string;
}

export interface WebhookAttempt {
  number: number;
  status?: number;
  error?: string;
  durationMs: number;
  nextRetryAt?: string;
}

export interface WebhookDeliveryResult {
  deliveryId: string;
  eventId: string;
  success: boolean;
  attempts: WebhookAttempt[];
}

export interface WebhookMetric {
  name: "webhook_delivery_attempt" | "webhook_delivery_completed";
  value: number;
  tags: Record<string, string | number | boolean>;
}
