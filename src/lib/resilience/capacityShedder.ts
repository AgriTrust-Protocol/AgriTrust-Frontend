import type { FeatureFlag } from "./featureFlags";

export type CapacityLevel = "normal" | "constrained" | "critical";

export type CapacitySignal = Readonly<{
  errorRate: number;
  p99LatencyMs: number;
}>;

/** Optional features removed first while preserving wallet and core workflows. */
export const shedFeatures: Readonly<Record<CapacityLevel, readonly FeatureFlag[]>> = {
  normal: [],
  constrained: ["zkpCircuitPreload", "serviceWorker"],
  critical: ["zkpCircuitPreload", "serviceWorker", "analytics", "maps"],
};

export function classifyCapacity(
  signal: CapacitySignal,
  thresholds = { constrainedP99Ms: 100, criticalP99Ms: 500, constrainedErrorRate: 0.02, criticalErrorRate: 0.1 },
): CapacityLevel {
  if (signal.p99LatencyMs >= thresholds.criticalP99Ms || signal.errorRate >= thresholds.criticalErrorRate) return "critical";
  if (signal.p99LatencyMs >= thresholds.constrainedP99Ms || signal.errorRate >= thresholds.constrainedErrorRate) return "constrained";
  return "normal";
}

export function isFeatureShed(feature: FeatureFlag, level: CapacityLevel): boolean {
  return shedFeatures[level].includes(feature);
}

/** Deployment control-plane override for incident response. Invalid input fails safe. */
export function getConfiguredCapacityLevel(env: Record<string, string | undefined> = {
  NEXT_PUBLIC_CAPACITY_LEVEL: process.env.NEXT_PUBLIC_CAPACITY_LEVEL,
}): CapacityLevel {
  const configured = env.NEXT_PUBLIC_CAPACITY_LEVEL?.trim().toLowerCase();
  return configured === "constrained" || configured === "critical" ? configured : "normal";
}
