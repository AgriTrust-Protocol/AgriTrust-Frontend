/**
 * Stress tests for the high-frequency telemetry ingestion throttling
 * layer (#180): 500 frames pushed within one second must trigger at most
 * 3 downstream state applications (renders), with zero frame loss inside
 * the batching window. Also covers the sliding window bounds, time-range
 * queries, and memory-cap eviction.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  TelemetryBuffer,
  type TelemetryPoint,
} from "@/src/utils/telemetryBuffer";

function point(metric: string, value: number, timestamp: number): TelemetryPoint {
  return { metric, value, timestamp };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TelemetryBuffer", () => {
  it("flushes pending frames to subscribers on the batch interval", () => {
    const buffer = new TelemetryBuffer({ batchInterval: 450 });
    const batches: number[] = [];
    const unsubscribe = buffer.subscribe((batch) => batches.push(batch.length));

    buffer.push(point("temperature", 21.5, 1));
    buffer.push(point("temperature", 22.0, 2));
    expect(batches).toHaveLength(0);

    vi.advanceTimersByTime(450);
    expect(batches).toEqual([2]);

    unsubscribe();
    buffer.dispose();
  });

  it("stress: 500 events in 1 second cause at most 3 renders and lose nothing", () => {
    const buffer = new TelemetryBuffer({ batchInterval: 450 });
    let renderCalls = 0;
    let delivered = 0;
    const unsubscribe = buffer.subscribe((batch) => {
      renderCalls++;
      delivered += batch.length;
    });

    // Simulate a 200Hz feed: 500 frames spread across one second.
    for (let i = 0; i < 500; i++) {
      buffer.push(point("temperature", 20 + i / 100, i * 2));
      vi.advanceTimersByTime(2); // 500 * 2ms = 1000ms total
    }

    // Flushes land at ~450ms and ~900ms during the sprint, plus one
    // final drain tick for the tail of the window.
    vi.advanceTimersByTime(450);

    // At most 3 downstream renders (state applications) for 500 frames.
    expect(renderCalls).toBeLessThanOrEqual(3);
    // No more than 10% (here: 0%) of frames may be dropped in batching.
    expect(delivered).toBe(500);

    unsubscribe();
    buffer.dispose();
  });

  it("getWindow returns archived points within [startTime, endTime]", () => {
    const buffer = new TelemetryBuffer({ batchInterval: 450 });
    buffer.push(point("humidity", 40, 1_000));
    buffer.push(point("humidity", 41, 2_000));
    buffer.push(point("humidity", 42, 3_000));
    buffer.flush();

    const window = buffer.getWindow(1_500, 2_500);
    expect(window).toHaveLength(1);
    expect(window[0].value).toBe(41);
    expect(buffer.getWindow(0, 10)).toHaveLength(0);

    buffer.dispose();
  });

  it("evicts oldest entries beyond maxPoints (memory bound)", () => {
    const buffer = new TelemetryBuffer({ batchInterval: 450, maxPoints: 5 });
    for (let i = 0; i < 12; i++) buffer.push(point("gps", i, i * 100));
    buffer.flush();

    const snapshot = buffer.getSnapshot();
    expect(snapshot.length).toBeLessThanOrEqual(5);
    // Newest entries survive eviction.
    expect(snapshot[snapshot.length - 1].timestamp).toBe(1_100);
    expect(buffer.droppedFrames).toBeGreaterThan(0);

    buffer.dispose();
  });

  it("dispose stops the timer and delivers any straggling frames", () => {
    const buffer = new TelemetryBuffer({ batchInterval: 450 });
    const batches: number[] = [];
    const unsubscribe = buffer.subscribe((batch) => batches.push(batch.length));

    buffer.push(point("temperature", 1, 1));
    buffer.dispose();

    expect(batches).toEqual([1]);
    expect(vi.getTimerCount()).toBe(0);
    unsubscribe();
  });
});
