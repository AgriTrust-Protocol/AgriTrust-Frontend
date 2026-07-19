import { describe, expect, it } from "vitest";
import { auditRuntimeConfig, fingerprintConfig, runtimeConfigMetrics } from "./audit";

const baseEnv = {
  APP_VERSION: "2026.07.19-1",
  NODE_ENV: "production",
  NEXT_PUBLIC_CAPACITY_LEVEL: "normal",
  NEXT_PUBLIC_OTEL_LOGS_ENDPOINT: "https://otel.example.test/logs",
  NEXT_PUBLIC_WEB_VITALS_ENDPOINT: "https://otel.example.test/vitals",
  UPSTASH_REDIS_REST_URL: "https://redis.example.test",
  UPSTASH_REDIS_REST_TOKEN: "super-secret",
};

describe("auditRuntimeConfig", () => {
  it("produces deterministic sanitized fingerprints without leaking secrets", () => {
    const first = auditRuntimeConfig({ env: baseEnv, now: new Date("2026-07-19T00:00:00Z") });
    const second = auditRuntimeConfig({ env: { ...baseEnv, UPSTASH_REDIS_REST_TOKEN: "rotated-secret" } });

    expect(first.compliant).toBe(true);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.sanitizedConfig.UPSTASH_REDIS_REST_TOKEN).toBe("[redacted]");
    expect(first.sanitizedConfig.UPSTASH_REDIS_REST_TOKEN).not.toContain("super-secret");
  });

  it("detects required, pattern, and baseline drift", () => {
    const result = auditRuntimeConfig({
      env: { ...baseEnv, NODE_ENV: "prod", APP_VERSION: undefined },
      expectedFingerprint: "known-good",
    });

    expect(result.compliant).toBe(false);
    expect(result.drift).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "APP_VERSION", reason: "missing" }),
        expect.objectContaining({ key: "NODE_ENV", reason: "pattern" }),
        expect.objectContaining({ key: "runtime_config_fingerprint", reason: "fingerprint" }),
      ]),
    );
  });

  it("emits Prometheus gauges for compliance and drift", () => {
    const result = auditRuntimeConfig({ env: baseEnv });
    const metrics = runtimeConfigMetrics(result);

    expect(metrics).toContain("agritrust_runtime_config_compliant");
    expect(metrics).toContain("agritrust_runtime_config_drift_total");
  });

  it("sorts keys before fingerprinting", () => {
    expect(fingerprintConfig({ B: "2", A: "1" })).toBe(fingerprintConfig({ A: "1", B: "2" }));
  });
});
