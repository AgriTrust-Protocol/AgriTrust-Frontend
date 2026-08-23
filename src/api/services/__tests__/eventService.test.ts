/**
 * Unit tests for the SSE event service (#173): monotonic ingest ids,
 * UUIDv7 generated ids, the sliding-window dedup layer, and stream
 * ingestion/normalisation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  connectEventStream,
  createEventDeduper,
  generateUuidV7,
  nextEventId,
  type BatchEvent,
} from "@/src/api/services/eventService";

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  readyState = 0;
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
    this.readyState = 2;
  }

  emitOpen() {
    this.readyState = 1;
    this.onopen?.();
  }

  emitPayload(payload: unknown) {
    this.onmessage?.(
      new MessageEvent("message", { data: JSON.stringify(payload) }),
    );
  }

  static reset() {
    MockEventSource.instances = [];
  }
}

beforeEach(() => {
  MockEventSource.reset();
  vi.stubGlobal("EventSource", MockEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("nextEventId", () => {
  it("never produces duplicates, even within one millisecond", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) seen.add(nextEventId());
    expect(seen.size).toBe(10_000);
  });

  it("stays unique when performance.now() is frozen", () => {
    const spy = vi.spyOn(performance, "now").mockReturnValue(1234.5678);
    const a = nextEventId();
    const b = nextEventId();
    expect(a).not.toBe(b);
    expect(a.startsWith("1234.5678-")).toBe(true);
    spy.mockRestore();
  });
});

describe("generateUuidV7", () => {
  const UUID_V7 =
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it("produces RFC-shaped UUIDv7 values", () => {
    for (let i = 0; i < 100; i++) {
      expect(generateUuidV7()).toMatch(UUID_V7);
    }
  });

  it("encodes the timestamp in the leading 48 bits", () => {
    const ts = 1_755_000_000_000;
    const id = generateUuidV7(ts);
    const topHex = id.replace(/-/g, "").slice(0, 12);
    expect(BigInt("0x" + topHex)).toBe(BigInt(ts));
  });

  it("is unique across bursts and sortable by creation time", () => {
    const ids: string[] = [];
    for (let i = 0; i < 5_000; i++) ids.push(generateUuidV7());
    expect(new Set(ids).size).toBe(ids.length);

    const early = generateUuidV7(1_000);
    const late = generateUuidV7(2_000);
    expect(early < late).toBe(true);
  });
});

describe("createEventDeduper", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts an id once, rejects repeats inside the window", () => {
    const deduper = createEventDeduper({ windowMs: 1000 });
    expect(deduper.check("evt-1")).toBe(true);
    expect(deduper.check("evt-1")).toBe(false);
    expect(deduper.check("evt-2")).toBe(true);
  });

  it("re-allows an id after the window elapses", () => {
    const deduper = createEventDeduper({ windowMs: 1000 });
    deduper.check("evt-1");
    vi.advanceTimersByTime(1001);
    expect(deduper.check("evt-1")).toBe(true);
  });

  it("clear drops all tracked ids", () => {
    const deduper = createEventDeduper({ windowMs: 60_000 });
    deduper.check("evt-1");
    deduper.clear();
    expect(deduper.check("evt-1")).toBe(true);
  });
});

describe("connectEventStream", () => {
  it("ingests payloads with minted monotonic + UUIDv7 ids", () => {
    const received: BatchEvent[] = [];
    const dispose = connectEventStream("/api/v1/events/stream", {
      onEvent: (event) => received.push(event),
    });

    const source = MockEventSource.instances[0];
    source.emitOpen();
    source.emitPayload({
      id: "srv-42",
      type: "batch.certified",
      batchId: "BATCH-A1",
      timestamp: 1_755_000_000_000,
    });

    const event = received[0];
    expect(event.eventId).toBe("srv-42");
    expect(event.id).not.toBe("");
    expect(event.generatedId).toMatch(/^[0-9a-f-]{36}$/);
    expect(event.type).toBe("batch.certified");
    expect(event.batchId).toBe("BATCH-A1");

    dispose();
    expect(source.closed).toBe(true);
  });

  it("normalises unknown types and tolerates missing fields", () => {
    const received: BatchEvent[] = [];
    const dispose = connectEventStream("/api/v1/events/stream", {
      onEvent: (event) => received.push(event),
    });

    const source = MockEventSource.instances[0];
    source.emitPayload({ eventId: 7, type: "mystery.event", batchId: "B" });
    expect(received[0].eventId).toBe("7");
    expect(received[0].type).toBe("batch.registered");

    dispose();
  });

  it("reports malformed JSON through onError without throwing", () => {
    const onError = vi.fn();
    const dispose = connectEventStream("/api/v1/events/stream", { onError });

    const source = MockEventSource.instances[0];
    expect(() =>
      source.onmessage?.(
        new MessageEvent("message", { data: "{not json" }),
      ),
    ).not.toThrow();
    expect(onError).toHaveBeenCalled();

    dispose();
  });
});
