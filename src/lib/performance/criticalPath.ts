/**
 * Shared rules for the latency SLO used by critical user journeys.
 *
 * Keeping this calculation independent from the transport makes it usable by
 * browser telemetry, synthetic checks, and the alerting backend.
 */
export const CRITICAL_PATH_P99_MS = 100;

export type CriticalPathSample = {
  path: string;
  durationMs: number;
};

export type CriticalPathEvaluation = {
  count: number;
  p99Ms: number;
  targetMs: number;
  meetsTarget: boolean;
};

export function percentile(samples: readonly number[], percentileValue: number): number {
  if (samples.length === 0) {
    throw new Error("At least one latency sample is required");
  }
  if (percentileValue < 0 || percentileValue > 1) {
    throw new Error("Percentile must be between 0 and 1");
  }

  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1)];
}

export function evaluateCriticalPath(
  samples: readonly CriticalPathSample[],
  targetMs = CRITICAL_PATH_P99_MS,
): CriticalPathEvaluation {
  if (targetMs <= 0) {
    throw new Error("The latency target must be greater than zero");
  }

  const durations = samples.map(({ durationMs }) => {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new Error("Latency samples must be finite, non-negative numbers");
    }
    return durationMs;
  });
  const p99Ms = percentile(durations, 0.99);

  return {
    count: durations.length,
    p99Ms,
    targetMs,
    meetsTarget: p99Ms < targetMs,
  };
}
