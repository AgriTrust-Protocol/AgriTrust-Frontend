import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeatureGate, ResilienceProvider } from "./ResilienceProvider";

describe("FeatureGate", () => {
  it("hides a flagged feature during critical shedding", () => {
    render(
      <ResilienceProvider signal={{ p99LatencyMs: 600, errorRate: 0 }}>
        <FeatureGate feature="maps" fallback={<span>unavailable</span>}>
          <span>map</span>
        </FeatureGate>
      </ResilienceProvider>,
    );
    expect(screen.queryByText("unavailable")).not.toBeNull();
    expect(screen.queryByText("map")).toBeNull();
  });
});
