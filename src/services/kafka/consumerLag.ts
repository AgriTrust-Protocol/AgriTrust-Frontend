import type {
  ConsumerGroupLagSummary,
  ConsumerLagSample,
  ConsumerScalePolicy,
  LagAlert,
  LagSeverity,
  ScaleDecision,
  ScaleEvaluationState,
} from "@/src/types/kafka";

/** Conservative defaults that protect a group from a lag spike without over-scaling. */
export const DEFAULT_CONSUMER_SCALE_POLICY: ConsumerScalePolicy = {
  minReplicas: 1,
  maxReplicas: 12,
  targetLagPerReplica: 1_000,
  scaleUpLag: 2_000,
  scaleDownLag: 250,
  cooldownMs: 5 * 60 * 1_000,
  requiredHealthySamples: 3,
};

const LABEL_VALUE = /^[A-Za-z0-9._-]{1,128}$/;

/** Reject malformed telemetry before it affects scaling decisions or metric labels. */
export function assertValidLagSample(sample: ConsumerLagSample): void {
  if (!LABEL_VALUE.test(sample.consumerGroup) || !LABEL_VALUE.test(sample.topic)) {
    throw new Error("Kafka consumer group and topic must use safe metric-label characters.");
  }
  if (!Number.isInteger(sample.partition) || sample.partition < 0) {
    throw new Error("Kafka partition must be a non-negative integer.");
  }
  if (!Number.isFinite(sample.lag) || sample.lag < 0 || !Number.isFinite(sample.memberCount) || sample.memberCount < 0) {
    throw new Error("Kafka lag and member count must be finite non-negative values.");
  }
  if (Number.isNaN(Date.parse(sample.observedAt))) {
    throw new Error("Kafka observedAt must be an ISO-8601 timestamp.");
  }
}

export function lagSeverity(totalLag: number, policy: Pick<ConsumerScalePolicy, "scaleUpLag">): LagSeverity {
  if (totalLag >= policy.scaleUpLag * 2) return "critical";
  if (totalLag >= policy.scaleUpLag) return "warning";
  return "ok";
}

/** Aggregate partition metrics into one bounded, render-ready row per group. */
export function summarizeConsumerLag(
  samples: readonly ConsumerLagSample[],
  policy: Pick<ConsumerScalePolicy, "scaleUpLag"> = DEFAULT_CONSUMER_SCALE_POLICY,
): ConsumerGroupLagSummary[] {
  const groups = new Map<string, ConsumerGroupLagSummary>();
  for (const sample of samples) {
    assertValidLagSample(sample);
    const existing = groups.get(sample.consumerGroup);
    if (!existing) {
      groups.set(sample.consumerGroup, {
        consumerGroup: sample.consumerGroup, totalLag: sample.lag, maxPartitionLag: sample.lag,
        memberCount: sample.memberCount, observedAt: sample.observedAt, severity: "ok",
      });
      continue;
    }
    existing.totalLag += sample.lag;
    existing.maxPartitionLag = Math.max(existing.maxPartitionLag, sample.lag);
    existing.memberCount = Math.max(existing.memberCount, sample.memberCount);
    if (Date.parse(sample.observedAt) > Date.parse(existing.observedAt)) existing.observedAt = sample.observedAt;
  }
  return [...groups.values()].map((summary) => ({ ...summary, severity: lagSeverity(summary.totalLag, policy) }))
    .sort((a, b) => b.totalLag - a.totalLag || a.consumerGroup.localeCompare(b.consumerGroup));
}

function assertPolicy(policy: ConsumerScalePolicy): void {
  if (!Number.isInteger(policy.minReplicas) || !Number.isInteger(policy.maxReplicas) || policy.minReplicas < 1 || policy.maxReplicas < policy.minReplicas ||
    policy.targetLagPerReplica <= 0 || policy.scaleDownLag < 0 || policy.scaleUpLag <= policy.scaleDownLag || policy.cooldownMs < 0 ||
    !Number.isInteger(policy.requiredHealthySamples) || policy.requiredHealthySamples < 1) {
    throw new Error("Invalid consumer scaling policy.");
  }
}

/**
 * Produce a deterministic, cooldown-aware desired replica count. The caller owns
 * the actual Kubernetes/HPA mutation; this pure function makes the critical path testable.
 */
export function evaluateConsumerScaling(
  totalLag: number,
  state: ScaleEvaluationState,
  policy: ConsumerScalePolicy = DEFAULT_CONSUMER_SCALE_POLICY,
  now = new Date(),
): ScaleDecision {
  assertPolicy(policy);
  if (!Number.isFinite(totalLag) || totalLag < 0 || !Number.isInteger(state.currentReplicas) || state.currentReplicas < policy.minReplicas) {
    throw new Error("Invalid consumer scaling input.");
  }
  const desiredForLag = Math.min(policy.maxReplicas, Math.max(policy.minReplicas, Math.ceil(totalLag / policy.targetLagPerReplica)));
  const lastScaled = state.lastScaledAt ? Date.parse(state.lastScaledAt) : Number.NEGATIVE_INFINITY;
  const inCooldown = Number.isFinite(lastScaled) && now.getTime() - lastScaled < policy.cooldownMs;
  const healthy = totalLag <= policy.scaleDownLag;
  const nextHealthySamples = healthy ? state.consecutiveHealthySamples + 1 : 0;
  const stableState = { ...state, consecutiveHealthySamples: nextHealthySamples };

  if (inCooldown) return { action: "hold", desiredReplicas: state.currentReplicas, reason: "cooldown active", nextState: stableState };
  if (totalLag >= policy.scaleUpLag && desiredForLag > state.currentReplicas) {
    return { action: "scale_up", desiredReplicas: desiredForLag, reason: "lag exceeds scale-up threshold", nextState: { currentReplicas: desiredForLag, lastScaledAt: now.toISOString(), consecutiveHealthySamples: 0 } };
  }
  if (healthy && nextHealthySamples >= policy.requiredHealthySamples && state.currentReplicas > policy.minReplicas) {
    const desired = Math.max(policy.minReplicas, desiredForLag, state.currentReplicas - 1);
    return { action: "scale_down", desiredReplicas: desired, reason: "lag remained below scale-down threshold", nextState: { currentReplicas: desired, lastScaledAt: now.toISOString(), consecutiveHealthySamples: 0 } };
  }
  return { action: "hold", desiredReplicas: state.currentReplicas, reason: healthy ? "awaiting healthy samples" : "lag within operating band", nextState: stableState };
}

export function createLagAlerts(summaries: readonly ConsumerGroupLagSummary[]): LagAlert[] {
  return summaries.filter((summary): summary is ConsumerGroupLagSummary & { severity: Exclude<LagSeverity, "ok"> } => summary.severity !== "ok")
    .map((summary) => ({ consumerGroup: summary.consumerGroup, severity: summary.severity, observedAt: summary.observedAt, summary: `${summary.consumerGroup} has ${summary.totalLag} messages of consumer lag` }));
}

/** Render safe, Prometheus-compatible gauge samples for the platform metrics scraper. */
export function toPrometheusLagMetrics(samples: readonly ConsumerLagSample[]): string {
  const lines = ["# HELP agritrust_kafka_consumer_lag_messages Unconsumed Kafka records by consumer group and topic.", "# TYPE agritrust_kafka_consumer_lag_messages gauge"];
  for (const sample of samples) {
    assertValidLagSample(sample);
    lines.push(`agritrust_kafka_consumer_lag_messages{consumer_group="${sample.consumerGroup}",topic="${sample.topic}",partition="${sample.partition}"} ${sample.lag}`);
  }
  return `${lines.join("\n")}\n`;
}
