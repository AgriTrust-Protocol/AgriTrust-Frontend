/** A point-in-time Kafka consumer-group lag measurement supplied by the telemetry API. */
export interface ConsumerLagSample {
  consumerGroup: string;
  topic: string;
  partition: number;
  lag: number;
  memberCount: number;
  observedAt: string;
}

export type LagSeverity = "ok" | "warning" | "critical";

export interface ConsumerGroupLagSummary {
  consumerGroup: string;
  totalLag: number;
  maxPartitionLag: number;
  memberCount: number;
  observedAt: string;
  severity: LagSeverity;
}

export interface ConsumerScalePolicy {
  minReplicas: number;
  maxReplicas: number;
  targetLagPerReplica: number;
  scaleUpLag: number;
  scaleDownLag: number;
  cooldownMs: number;
  requiredHealthySamples: number;
}

export interface ScaleEvaluationState {
  currentReplicas: number;
  lastScaledAt?: string;
  consecutiveHealthySamples: number;
}

export type ScaleAction = "scale_up" | "scale_down" | "hold";

export interface ScaleDecision {
  action: ScaleAction;
  desiredReplicas: number;
  reason: string;
  nextState: ScaleEvaluationState;
}

export interface LagAlert {
  consumerGroup: string;
  severity: Exclude<LagSeverity, "ok">;
  summary: string;
  observedAt: string;
}
