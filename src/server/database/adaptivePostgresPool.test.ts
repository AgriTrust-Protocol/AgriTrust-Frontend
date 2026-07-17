import { describe, expect, it, vi } from "vitest";
import { AdaptivePostgresPool, type PoolAdapter } from "./adaptivePostgresPool";

function adapter(overrides: Partial<PoolAdapter> = {}): PoolAdapter {
  return {
    query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
    end: vi.fn().mockResolvedValue(undefined),
    snapshot: vi.fn().mockReturnValue({ total: 1, idle: 1, waiting: 0, max: 2 }),
    ...overrides,
  };
}

describe("AdaptivePostgresPool", () => {
  it("reports an ok health result after a successful bounded probe", async () => {
    const active = adapter();
    const pool = new AdaptivePostgresPool(() => adapter(), { min: 1, initial: 2, max: 6 }, active);

    const health = await pool.probe();

    expect(health.status).toBe("ok");
    expect(health.consecutiveFailures).toBe(0);
    expect(active.query).toHaveBeenCalledWith("SELECT 1");
    expect(pool.getMetrics().probesTotal).toBe(1);
  });

  it("changes from degraded to down only after consecutive probe failures", async () => {
    const active = adapter({ query: vi.fn().mockRejectedValue(new Error("credential rejected")) });
    const pool = new AdaptivePostgresPool(() => adapter(), { min: 1, initial: 2, max: 6 }, active);

    expect((await pool.probe()).status).toBe("degraded");
    expect((await pool.probe()).status).toBe("down");
    expect(pool.getMetrics().probeFailuresTotal).toBe(2);
  });

  it("scales up with a replacement pool when demand is saturated", async () => {
    const active = adapter({ snapshot: vi.fn().mockReturnValue({ total: 2, idle: 0, waiting: 1, max: 2 }) });
    const replacement = adapter();
    const factory = vi.fn().mockReturnValue(replacement);
    const pool = new AdaptivePostgresPool(factory, {
      min: 1, initial: 2, max: 6, resizeStep: 2, scaleUpCooldownMs: 0,
    }, active);

    await pool.probe(100);

    expect(factory).toHaveBeenCalledWith(4);
    expect(active.end).toHaveBeenCalledOnce();
    expect(pool.getMetrics().targetSize).toBe(4);
    expect(pool.getMetrics().resizeTotal).toBe(1);
  });

  it("times out probes and does not expose the underlying error", async () => {
    vi.useFakeTimers();
    const active = adapter({ query: vi.fn().mockImplementation(() => new Promise(() => undefined)) });
    const pool = new AdaptivePostgresPool(() => adapter(), { min: 1, initial: 2, max: 6, probeTimeoutMs: 10 }, active);
    const result = pool.probe();
    await vi.advanceTimersByTimeAsync(10);

    expect((await result).status).toBe("degraded");
    vi.useRealTimers();
  });

  it("rejects unsafe or contradictory capacity limits", () => {
    expect(() => new AdaptivePostgresPool(() => adapter(), { min: 5, max: 2 })).toThrow("Invalid adaptive");
  });
});
