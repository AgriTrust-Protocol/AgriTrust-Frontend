import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/tests/setup/server";
import { WeatherPlanner } from "@/src/components/dashboard/WeatherPlanner";
import type { ForecastPeriod } from "@/src/services/weatherForecast";

const mockPeriods: ForecastPeriod[] = [
  { timestamp: 1718000000, temperatureC: 22, precipitationMm: 0, precipitationProbability: 10, windKph: 5, icon: "☀️", summary: "Sunny" },
  { timestamp: 1718086400, temperatureC: 45, precipitationMm: 0, precipitationProbability: 0, windKph: 10, icon: "☀️", summary: "Heatwave" },
];

describe("WeatherPlanner", () => {
  it("shows preview data before API resolves", async () => {
    // Delay API response
    server.use(
      http.get("/api/weather/forecast", async () => {
        return new Promise(() => {}); // Never resolves, so we see preview state
      })
    );

    render(<WeatherPlanner />);
    expect(screen.getByText("Forecast preview · updated every 30 minutes")).toBeInTheDocument();
  });

  it("loads realistic shaped data on success", async () => {
    server.use(
      http.get("/api/weather/forecast", () => {
        return HttpResponse.json(mockPeriods);
      })
    );

    render(<WeatherPlanner />);
    
    // Wait for the Live string
    expect(await screen.findByText("Live farm forecast · updated every 30 minutes")).toBeInTheDocument();
    
    // The heatwave (45C) triggers an alert
    expect(screen.getByText(/Planner alert:/)).toBeInTheDocument();
  });

  it("handles error/failure responses gracefully", async () => {
    server.use(
      http.get("/api/weather/forecast", () => {
        return new HttpResponse(null, { status: 500 });
      })
    );

    render(<WeatherPlanner />);
    
    // It should silently catch the error and keep showing preview data
    // Waiting for the microtasks to settle is tricky, but getByText is sync.
    // We can use findByText for the default state to ensure the component rendered.
    expect(await screen.findByText("Forecast preview · updated every 30 minutes")).toBeInTheDocument();
    
    // Wait a short time to ensure it doesn't change to "Live"
    await new Promise(r => setTimeout(r, 100));
    expect(screen.queryByText("Live farm forecast · updated every 30 minutes")).not.toBeInTheDocument();
  });
});
