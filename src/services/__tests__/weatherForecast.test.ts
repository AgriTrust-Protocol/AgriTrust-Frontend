import { describe, expect, it } from "vitest";
import { buildDailyForecast, getAdverseConditions, getSeverity, type ForecastPeriod } from "../weatherForecast";

const basePeriod: ForecastPeriod = {
  timestamp: Date.UTC(2026, 6, 17) / 1000,
  temperatureC: 24,
  precipitationMm: 0,
  precipitationProbability: 10,
  windKph: 12,
  icon: "☀️",
  summary: "Clear",
};

describe("weather forecast severity", () => {
  it("identifies every condition at its defined adverse threshold", () => {
    expect(getAdverseConditions({ ...basePeriod, precipitationMm: 11, temperatureC: -1, windKph: 51 }))
      .toEqual(["rain", "frost", "wind"]);
    expect(getSeverity({ ...basePeriod, temperatureC: 41 })).toBe("adverse");
  });

  it("rolls 3-hour periods into a seven-day planner forecast", () => {
    const forecast = buildDailyForecast([
      basePeriod,
      { ...basePeriod, timestamp: basePeriod.timestamp + 3 * 60 * 60, temperatureC: 30, precipitationProbability: 45 },
    ]);
    expect(forecast).toHaveLength(1);
    expect(forecast[0]).toMatchObject({ highC: 30, lowC: 24, precipitationProbability: 45, severity: "normal" });
  });
});
