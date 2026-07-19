import { describe, expect, it } from "vitest";

import {
  AVAILABILITY_ERROR_BUDGET_RATIO,
  BURN_RATE_WINDOWS,
  calculateBurnRate,
  evaluateServiceLevelObjectives,
} from "./burnRate";

describe("SLO burn rate helpers", () => {
  it("calculates burn rate relative to the 99.99% availability error budget", () => {
    expect(calculateBurnRate(AVAILABILITY_ERROR_BUDGET_RATIO)).toBeCloseTo(1);
    expect(calculateBurnRate(0.00144)).toBeCloseTo(14.4);
  });

  it("evaluates availability and latency objectives", () => {
    const result = evaluateServiceLevelObjectives({
      totalRequests: 1_000_000,
      failedRequests: 50,
      p99LatencyMs: 95,
    });

    expect(result.availabilityRatio).toBeCloseTo(0.99995);
    expect(result.burnRate).toBeCloseTo(0.5);
    expect(result.availabilitySloMet).toBe(true);
    expect(result.latencySloMet).toBe(true);
  });

  it("exposes multi-window burn rate alert thresholds", () => {
    expect(BURN_RATE_WINDOWS).toEqual([
      { shortWindow: "5m", longWindow: "1h", burnRateThreshold: 14.4, severity: "page" },
      { shortWindow: "30m", longWindow: "6h", burnRateThreshold: 6, severity: "page" },
      { shortWindow: "2h", longWindow: "1d", burnRateThreshold: 3, severity: "ticket" },
    ]);
  });

  it("rejects impossible request counts", () => {
    expect(() =>
      evaluateServiceLevelObjectives({ totalRequests: 10, failedRequests: 11, p99LatencyMs: 75 }),
    ).toThrow("failedRequests cannot exceed totalRequests");
  });
});
