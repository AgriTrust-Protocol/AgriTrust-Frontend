import { describe, expect, it, vi } from "vitest";
import { createRuntimeConfigManager, parseRuntimeConfig } from "./configManager";

describe("runtime configuration management", () => {
  it("applies defaults and validates feature flag names", () => {
    expect(parseRuntimeConfig({ featureFlags: { "maps.enabled": true } })).toMatchObject({
      schemaVersion: "2026-07-19",
      environment: "development",
      releaseColor: "blue",
      capacityLevel: "normal",
      criticalPathP99TargetMs: 100,
      featureFlags: { "maps.enabled": true },
    });

    expect(() => parseRuntimeConfig({ featureFlags: { "Bad Flag": true } })).toThrow(/featureFlags keys/);
  });

  it("hot-reloads valid configuration and notifies subscribers", async () => {
    const source = vi.fn().mockResolvedValue({
      environment: "production",
      releaseColor: "green",
      capacityLevel: "constrained",
      criticalPathP99TargetMs: 75,
      featureFlags: { analytics: false },
    });
    const manager = createRuntimeConfigManager({ featureFlags: {} }, source);
    const listener = vi.fn();
    manager.subscribe(listener);

    const report = await manager.reload();

    expect(report.accepted).toBe(true);
    expect(report.snapshot.version).toBe(2);
    expect(manager.getSnapshot().value.releaseColor).toBe("green");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid hot-reload payloads and keeps last good snapshot", async () => {
    const failures = vi.fn();
    const manager = createRuntimeConfigManager(
      { environment: "staging", featureFlags: { maps: true } },
      () => ({
        schemaVersion: "2026-07-19",
        environment: "qa",
        releaseColor: "blue",
        capacityLevel: "normal",
        criticalPathP99TargetMs: 100,
        // Invalid key name -> rejected by validation.
        featureFlags: { "Bad Flag": false },
      }),
      failures,
    );

    const report = await manager.reload();

    expect(report.accepted).toBe(false);
    expect(manager.getSnapshot().value.environment).toBe("staging");
    expect(manager.getSnapshot().value.featureFlags.maps).toBe(true);
    expect(failures).toHaveBeenCalledOnce();
  });
});
