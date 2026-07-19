export const AVAILABILITY_SLO_TARGET = 0.9999;
export const AVAILABILITY_ERROR_BUDGET_RATIO = 1 - AVAILABILITY_SLO_TARGET;
export const CRITICAL_PATH_LATENCY_TARGET_MS = 100;

export type BurnRateWindow = {
  readonly shortWindow: string;
  readonly longWindow: string;
  readonly burnRateThreshold: number;
  readonly severity: "page" | "ticket";
};

export type SloEvaluationInput = {
  readonly totalRequests: number;
  readonly failedRequests: number;
  readonly p99LatencyMs: number;
  readonly latencyTargetMs?: number;
  readonly errorBudgetRatio?: number;
};

export type SloEvaluation = {
  readonly availabilityRatio: number;
  readonly errorRatio: number;
  readonly burnRate: number;
  readonly latencyTargetMs: number;
  readonly latencySloMet: boolean;
  readonly availabilitySloMet: boolean;
};

export const BURN_RATE_WINDOWS: readonly BurnRateWindow[] = [
  { shortWindow: "5m", longWindow: "1h", burnRateThreshold: 14.4, severity: "page" },
  { shortWindow: "30m", longWindow: "6h", burnRateThreshold: 6, severity: "page" },
  { shortWindow: "2h", longWindow: "1d", burnRateThreshold: 3, severity: "ticket" },
];

function assertFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite, non-negative number`);
  }
}

export function calculateBurnRate(errorRatio: number, errorBudgetRatio = AVAILABILITY_ERROR_BUDGET_RATIO): number {
  assertFiniteNonNegative(errorRatio, "errorRatio");
  if (!Number.isFinite(errorBudgetRatio) || errorBudgetRatio <= 0 || errorBudgetRatio >= 1) {
    throw new Error("errorBudgetRatio must be greater than zero and less than one");
  }

  return errorRatio / errorBudgetRatio;
}

export function evaluateServiceLevelObjectives(input: SloEvaluationInput): SloEvaluation {
  const {
    totalRequests,
    failedRequests,
    p99LatencyMs,
    latencyTargetMs = CRITICAL_PATH_LATENCY_TARGET_MS,
    errorBudgetRatio = AVAILABILITY_ERROR_BUDGET_RATIO,
  } = input;

  assertFiniteNonNegative(totalRequests, "totalRequests");
  assertFiniteNonNegative(failedRequests, "failedRequests");
  assertFiniteNonNegative(p99LatencyMs, "p99LatencyMs");
  if (failedRequests > totalRequests) {
    throw new Error("failedRequests cannot exceed totalRequests");
  }
  if (!Number.isFinite(latencyTargetMs) || latencyTargetMs <= 0) {
    throw new Error("latencyTargetMs must be greater than zero");
  }

  const errorRatio = totalRequests === 0 ? 0 : failedRequests / totalRequests;
  const availabilityRatio = totalRequests === 0 ? 1 : 1 - errorRatio;

  return {
    availabilityRatio,
    errorRatio,
    burnRate: calculateBurnRate(errorRatio, errorBudgetRatio),
    latencyTargetMs,
    latencySloMet: p99LatencyMs < latencyTargetMs,
    availabilitySloMet: errorRatio <= errorBudgetRatio,
  };
}
