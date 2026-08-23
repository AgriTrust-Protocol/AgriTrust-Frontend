/**
 * Server-Sent Events service for the real-time batch certification
 * stream (`GET /api/v1/events/stream`).
 *
 * Fixes two high-throughput defects observed during end-of-season
 * certification sprints (100+ events/sec):
 *
 *  1. Duplicate IDs - `Date.now()` has millisecond precision, so events
 *     arriving within the same millisecond collided, making React drop
 *     keyed list items. IDs are now produced by a monotonic counter
 *     fused with `performance.now()`, guaranteeing uniqueness even for
 *     same-microsecond arrivals.
 *  2. Unkeyable payloads - every ingested event also receives a
 *     `generatedId` (UUIDv7, time-sortable) minted at the SSE handler
 *     level, which downstream lists use as their React key.
 */

export const BATCH_EVENT_TYPES = [
  "batch.registered",
  "batch.inspected",
  "batch.certified",
  "batch.shipped",
  "batch.delivered",
] as const;

export type BatchEventType = (typeof BATCH_EVENT_TYPES)[number];

export function isBatchEventType(value: string): value is BatchEventType {
  return (BATCH_EVENT_TYPES as readonly string[]).includes(value);
}

/** Shape of a raw payload arriving on the wire. */
export interface RawBatchEventPayload {
  /** Upstream event identifier (not guaranteed unique under load). */
  id?: string | number;
  eventId?: string | number;
  type: string;
  batchId: string;
  timestamp?: number;
}

/** Fully-ingested batch event consumed by the dashboard feed. */
export interface BatchEvent {
  /** Upstream identifier, normalised to a string. */
  eventId: string;
  /**
   * Monotonic ingest id: `performance.now()` fused with an ever-growing
   * counter. Unique even for events arriving in the same millisecond.
   */
  id: string;
  /** Time-sortable UUIDv7 assigned at the SSE handler level. */
  generatedId: string;
  type: BatchEventType;
  batchId: string;
  timestamp: number;
}

let eventCounter = 0;

/**
 * Monotonic event id. Replaces bare `Date.now()` ids whose millisecond
 * precision caused duplicate React keys at 100 events/sec.
 */
export function nextEventId(): string {
  return `${performance.now()}-${eventCounter++}`;
}

/** Format a byte array as contiguous lowercase hex. */
function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * UUIDv7 (RFC 9562): 48-bit big-endian unix-ms timestamp followed by
 * cryptographically random bits. Sorts chronologically, which keeps the
 * feed ordered even when batches arrive out of band.
 */
export function generateUuidV7(timestamp: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const view = new DataView(bytes.buffer);
  view.setBigUint64(0, BigInt(Math.trunc(timestamp)) << 16n, false);

  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx

  const hex = toHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface EventDedupOptions {
  /** Sliding window in ms; duplicates inside it are skipped. Default 1000. */
  windowMs?: number;
}

export interface EventDeduper {
  /**
   * Returns `true` the first time an id is seen within the window,
   * `false` for repeats. Entries self-evict after `windowMs`.
   */
  check: (eventId: string) => boolean;
  /** Drop all tracked ids immediately (tests, teardown). */
  clear: () => void;
}

/**
 * Dedup layer for the SSE handler: repeated deliveries of the same
 * upstream event inside `windowMs` are ignored.
 */
export function createEventDeduper(options: EventDedupOptions = {}): EventDeduper {
  const windowMs = options.windowMs ?? 1000;
  const seen = new Map<string, ReturnType<typeof setTimeout>>();

  return {
    check(eventId) {
      if (seen.has(eventId)) return false;
      seen.set(
        eventId,
        setTimeout(() => {
          seen.delete(eventId);
        }, windowMs),
      );
      return true;
    },
    clear() {
      for (const timer of seen.values()) clearTimeout(timer);
      seen.clear();
    },
  };
}

export interface EventStreamHandlers {
  onEvent: (event: BatchEvent) => void;
  onOpen?: () => void;
  onError?: (error: unknown) => void;
}

function normaliseType(type: string): BatchEventType {
  return isBatchEventType(type) ? type : "batch.registered";
}

/**
 * Open an SSE connection to the batch event stream and forward fully
 * ingested `BatchEvent`s (ids minted, types normalised) to `onEvent`.
 * Returns a disposer closing the connection.
 */
export function connectEventStream(
  url: string,
  handlers: EventStreamHandlers,
): () => void {
  const source = new EventSource(url);

  source.onopen = () => handlers.onOpen?.();

  source.onmessage = (messageEvent: MessageEvent) => {
    try {
      const payload = JSON.parse(String(messageEvent.data)) as RawBatchEventPayload;
      if (!payload || typeof payload.batchId !== "string") return;
      handlers.onEvent({
        eventId: String(payload.eventId ?? payload.id ?? ""),
        id: nextEventId(),
        generatedId: generateUuidV7(),
        type: normaliseType(payload.type),
        batchId: payload.batchId,
        timestamp:
          typeof payload.timestamp === "number"
            ? payload.timestamp
            : Date.now(),
      });
    } catch (error) {
      handlers.onError?.(error);
    }
  };

  source.onerror = (errorEvent: Event) => handlers.onError?.(errorEvent);

  return () => source.close();
}
