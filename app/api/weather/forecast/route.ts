import { NextRequest, NextResponse } from "next/server";
import type { ForecastPeriod } from "@/src/services/weatherForecast";

const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; forecast: ForecastPeriod[] }>();

type OneCallHour = {
  dt: number;
  temp: number;
  pop?: number;
  rain?: { "1h"?: number };
  snow?: { "1h"?: number };
  wind_speed: number;
  weather: Array<{ main: string; description: string; icon: string }>;
};

type OneCallDay = {
  dt: number;
  temp: { day: number; max: number; min: number };
  pop?: number;
  rain?: number;
  wind_speed: number;
  weather: Array<{ main: string; description: string; icon: string }>;
};

function toForecastPeriod(hour: OneCallHour): ForecastPeriod {
  const weather = hour.weather[0];
  const iconByCondition: Record<string, string> = {
    Thunderstorm: "⛈️", Drizzle: "🌦️", Rain: "🌧️", Snow: "❄️", Clear: "☀️", Clouds: "☁️",
  };
  return {
    timestamp: hour.dt,
    temperatureC: hour.temp,
    precipitationMm: hour.rain?.["1h"] ?? hour.snow?.["1h"] ?? 0,
    precipitationProbability: Math.round((hour.pop ?? 0) * 100),
    windKph: Math.round(hour.wind_speed * 3.6),
    icon: iconByCondition[weather?.main ?? ""] ?? "🌫️",
    summary: weather?.description ?? "Forecast unavailable",
  };
}

function toDailyFallback(day: OneCallDay): ForecastPeriod {
  return toForecastPeriod({
    dt: day.dt, temp: day.temp.day, pop: day.pop, rain: { "1h": day.rain },
    wind_speed: day.wind_speed, weather: day.weather,
  });
}

/**
 * Proxies OpenWeather One Call so the browser never receives the API key.
 * Deployments should replace this in-memory store with their Redis adapter; the
 * cache contract and 30-minute TTL remain the same.
 */
export async function GET(request: NextRequest) {
  const latitude = Number(request.nextUrl.searchParams.get("lat") ?? process.env.FARM_LATITUDE);
  const longitude = Number(request.nextUrl.searchParams.get("lon") ?? process.env.FARM_LONGITUDE);
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ error: "Weather integration is not configured" }, { status: 503 });
  }

  const cacheKey = `${latitude},${longitude}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return NextResponse.json(cached.forecast);

  const endpoint = new URL("https://api.openweathermap.org/data/3.0/onecall");
  endpoint.search = new URLSearchParams({ lat: String(latitude), lon: String(longitude), units: "metric", exclude: "minutely,alerts", appid: apiKey }).toString();
  const response = await fetch(endpoint, { next: { revalidate: 1800 } });
  if (!response.ok) return NextResponse.json({ error: "Weather provider request failed" }, { status: 502 });

  const payload = await response.json() as { hourly: OneCallHour[]; daily: OneCallDay[] };
  // One Call reports hourly values; keep every third point for the planner's 3-hour timeline.
  const threeHourly = payload.hourly.filter((_, index) => index % 3 === 0).map(toForecastPeriod);
  const datesWithHourlyData = new Set(threeHourly.map((period) => new Date(period.timestamp * 1000).toISOString().slice(0, 10)));
  // Hourly coverage is limited to 48h by One Call. Daily points preserve a full
  // seven-day planner when the provider has no 3-hour data for later days.
  const forecast = [...threeHourly, ...payload.daily.map(toDailyFallback).filter((period) => !datesWithHourlyData.has(new Date(period.timestamp * 1000).toISOString().slice(0, 10)))];
  cache.set(cacheKey, { forecast, expiresAt: Date.now() + CACHE_TTL_MS });
  return NextResponse.json(forecast);
}
