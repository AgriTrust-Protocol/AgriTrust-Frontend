/**
 * High-throughput stress tests for the BatchStatusFeed (#173): 200
 * certification events arriving within 2 seconds must all appear in the
 * rendered feed (no keyed-item loss), duplicate upstream deliveries must
 * be suppressed, and state application must be batched far below one
 * re-render per event.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { BatchStatusFeed } from "@/src/components/dashboard/BatchStatusFeed";

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
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

vi.stubGlobal("EventSource", MockEventSource);

const TYPES = [
  "batch.registered",
  "batch.inspected",
  "batch.certified",
  "batch.shipped",
  "batch.delivered",
] as const;

/** Feed configured so every event is inside the virtual viewport. */
function renderFeed(onFlushApplied?: (n: number) => void) {
  return render(
    <BatchStatusFeed
      streamUrl="/api/v1/events/stream"
      itemHeight={24}
      listHeight={200 * 24}
      onFlushApplied={onFlushApplied}
    />,
  );
}

beforeEach(() => {
  MockEventSource.reset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BatchStatusFeed", () => {
  it("shows the empty state before events arrive", () => {
    renderFeed();
    const source = MockEventSource.instances[0];
    act(() => source.emitOpen());
    expect(screen.getByTestId("batch-feed-empty")).toBeInTheDocument();
  });

  it("stress: renders all 200 events from a 2-second sprint without loss", () => {
    const flushSizes: number[] = [];
    renderFeed((size) => flushSizes.push(size));

    const source = MockEventSource.instances[0];
    act(() => source.emitOpen());

    // Sprint: 200 unique events over simulated 2s (one per 10ms).
    for (let i = 0; i < 200; i++) {
      act(() =>
        source.emitPayload({
          id: `evt-${i}`,
          type: TYPES[i % TYPES.length],
          batchId: `BATCH-${String(i).padStart(3, "0")}`,
          timestamp: 1_755_000_000_000 + i,
        }),
      );
      act(() => {
        vi.advanceTimersByTime(10);
      });
    }

    // Invariant: every ingested event is present exactly once.
    const rows = screen.getAllByTestId("batch-event");
    expect(rows).toHaveLength(200);
    expect(screen.getByTestId("batch-event-count")).toHaveTextContent(
      "200 events",
    );

    // State application is batched (~40 flush ticks), not per-event.
    expect(flushSizes.reduce((a, b) => a + b, 0)).toBe(200);
    expect(flushSizes.length).toBeGreaterThan(0);
    expect(flushSizes.length).toBeLessThanOrEqual(50);
    expect(flushSizes.length).toBeLessThan(200);
  });

  it("drops duplicate upstream deliveries within the dedup window", () => {
    renderFeed();

    const source = MockEventSource.instances[0];
    act(() => source.emitOpen());

    for (let i = 0; i < 5; i++) {
      act(() =>
        source.emitPayload({
          id: "evt-dup",
          type: "batch.certified",
          batchId: "BATCH-DUP",
        }),
      );
      act(() => {
        vi.advanceTimersByTime(60);
      });
    }

    // One row despite five deliveries of the same upstream id.
    expect(screen.getAllByTestId("batch-event")).toHaveLength(1);
  });

  it("keys rows on generated ids so same-ms upstream ids stay unique", () => {
    renderFeed();

    const source = MockEventSource.instances[0];
    act(() => source.emitOpen());

    // Two distinct events sharing an upstream id pattern that collides
    // when truncated to milliseconds must still produce two rows.
    act(() => {
      source.emitPayload({
        id: "same-ms",
        type: "batch.registered",
        batchId: "BATCH-X1",
      });
      source.emitPayload({
        id: "same-ms-2",
        type: "batch.certified",
        batchId: "BATCH-X2",
      });
    });
    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(screen.getAllByTestId("batch-event")).toHaveLength(2);
  });
});
