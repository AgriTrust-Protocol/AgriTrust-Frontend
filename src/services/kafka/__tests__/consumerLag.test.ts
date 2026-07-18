import { describe, expect, it } from "vitest";
import { createLagAlerts, evaluateConsumerScaling, summarizeConsumerLag, toPrometheusLagMetrics } from "@/src/services/kafka/consumerLag";
import type { ConsumerLagSample, ConsumerScalePolicy } from "@/src/types/kafka";

const policy: ConsumerScalePolicy = { minReplicas: 1, maxReplicas: 10, targetLagPerReplica: 100, scaleUpLag: 200, scaleDownLag: 25, cooldownMs: 60_000, requiredHealthySamples: 2 };
const now = new Date("2026-07-17T12:00:00.000Z");
const sample = (overrides: Partial<ConsumerLagSample> = {}): ConsumerLagSample => ({ consumerGroup: "certificate-worker", topic: "certificates", partition: 0, lag: 50, memberCount: 2, observedAt: now.toISOString(), ...overrides });

describe("Kafka consumer lag monitoring", () => {
  it("aggregates partitions, keeps the newest timestamp, and marks critical lag", () => {
    const summaries = summarizeConsumerLag([sample({ lag: 250, observedAt: "2026-07-17T11:00:00.000Z" }), sample({ partition: 1, lag: 200, observedAt: now.toISOString() })], policy);
    expect(summaries).toEqual([expect.objectContaining({ totalLag: 450, maxPartitionLag: 250, observedAt: now.toISOString(), severity: "critical" })]);
  });

  it("rejects untrusted metric labels and invalid lag values", () => {
    expect(() => summarizeConsumerLag([sample({ consumerGroup: 'group"} 9\nmetric{' })])).toThrow(/safe metric-label/);
    expect(() => summarizeConsumerLag([sample({ lag: -1 })])).toThrow(/finite non-negative/);
  });

  it("scales up based on target lag and preserves the decision timestamp", () => {
    const decision = evaluateConsumerScaling(340, { currentReplicas: 2, consecutiveHealthySamples: 0 }, policy, now);
    expect(decision).toMatchObject({ action: "scale_up", desiredReplicas: 4 });
    expect(decision.nextState.lastScaledAt).toBe(now.toISOString());
  });

  it("does not oscillate while cooldown is active", () => {
    const decision = evaluateConsumerScaling(1_000, { currentReplicas: 2, consecutiveHealthySamples: 0, lastScaledAt: "2026-07-17T11:59:30.000Z" }, policy, now);
    expect(decision.action).toBe("hold");
    expect(decision.reason).toBe("cooldown active");
  });

  it("only scales down after consecutive healthy samples", () => {
    const first = evaluateConsumerScaling(10, { currentReplicas: 3, consecutiveHealthySamples: 0 }, policy, now);
    expect(first.action).toBe("hold");
    const second = evaluateConsumerScaling(10, first.nextState, policy, new Date("2026-07-17T12:02:00.000Z"));
    expect(second).toMatchObject({ action: "scale_down", desiredReplicas: 2 });
  });

  it("creates actionable alerts and Prometheus gauges", () => {
    const summaries = summarizeConsumerLag([sample({ lag: 250 })], policy);
    expect(createLagAlerts(summaries)).toEqual([expect.objectContaining({ severity: "warning", consumerGroup: "certificate-worker" })]);
    expect(toPrometheusLagMetrics([sample()])).toContain('consumer_group="certificate-worker"');
  });
});
