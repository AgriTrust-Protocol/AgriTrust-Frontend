import { describe, expect, it } from "vitest";
import { classifyCapacity, getConfiguredCapacityLevel, isFeatureShed } from "./capacityShedder";
import { defaultFeatureFlags, getFeatureFlags } from "./featureFlags";

describe("resilience controls", () => {
  it("uses safe defaults and only accepts explicit true", () => {
    expect(getFeatureFlags({})).toEqual(defaultFeatureFlags);
    expect(getFeatureFlags({ NEXT_PUBLIC_FEATURE_MAPS: "false", NEXT_PUBLIC_FEATURE_ANALYTICS: "yes" }).maps).toBe(false);
    expect(getFeatureFlags({ NEXT_PUBLIC_FEATURE_MAPS: "false", NEXT_PUBLIC_FEATURE_ANALYTICS: "yes" }).analytics).toBe(false);
  });

  it("classifies capacity against the critical path SLO", () => {
    expect(classifyCapacity({ p99LatencyMs: 99, errorRate: 0 })).toBe("normal");
    expect(classifyCapacity({ p99LatencyMs: 100, errorRate: 0 })).toBe("constrained");
    expect(classifyCapacity({ p99LatencyMs: 500, errorRate: 0 })).toBe("critical");
    expect(classifyCapacity({ p99LatencyMs: 0, errorRate: 0.1 })).toBe("critical");
  });

  it("accepts only supported capacity overrides", () => {
    expect(getConfiguredCapacityLevel({ NEXT_PUBLIC_CAPACITY_LEVEL: "critical" })).toBe("critical");
    expect(getConfiguredCapacityLevel({ NEXT_PUBLIC_CAPACITY_LEVEL: "unexpected" })).toBe("normal");
  });

  it("sheds optional features before critical workflows", () => {
    expect(isFeatureShed("analytics", "constrained")).toBe(false);
    expect(isFeatureShed("zkpCircuitPreload", "constrained")).toBe(true);
    expect(isFeatureShed("maps", "critical")).toBe(true);
  });
});
