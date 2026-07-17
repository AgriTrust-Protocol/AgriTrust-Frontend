import { describe, expect, it } from "vitest";
import { evaluateCriticalPath, percentile } from "./criticalPath";

describe("critical-path performance rules", () => {
  it("uses the nearest-rank p99 so a slow tail is never hidden", () => {
    expect(percentile([12, 4, 8, 101, 6], 0.99)).toBe(101);
  });

  it("accepts a p99 strictly below the 100ms SLO", () => {
    expect(
      evaluateCriticalPath([
        { path: "/api/escrows", durationMs: 35 },
        { path: "/api/escrows", durationMs: 99 },
      ]),
    ).toMatchObject({ count: 2, p99Ms: 99, targetMs: 100, meetsTarget: true });
  });

  it("rejects a p99 at or above the SLO", () => {
    expect(
      evaluateCriticalPath([{ path: "/api/escrows", durationMs: 100 }]).meetsTarget,
    ).toBe(false);
  });

  it("rejects invalid input instead of emitting misleading telemetry", () => {
    expect(() => percentile([], 0.99)).toThrow("At least one latency sample");
    expect(() => evaluateCriticalPath([{ path: "/api/escrows", durationMs: -1 }])).toThrow(
      "non-negative",
    );
  });
});
