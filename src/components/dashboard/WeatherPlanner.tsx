"use client";

import { useEffect, useState } from "react";
import { buildDailyForecast, type DailyForecast, type ForecastPeriod, type WeatherSeverity } from "@/src/services/weatherForecast";

const severityStyles: Record<WeatherSeverity, string> = {
  normal: "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100",
  caution: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100",
  adverse: "border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100",
};

const severityLabel: Record<WeatherSeverity, string> = { normal: "Favourable", caution: "Caution", adverse: "Adverse" };

function demoPeriods(): ForecastPeriod[] {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Array.from({ length: 7 }, (_, day) => {
    const temperatures = [29, 31, 27, 42, 24, -1, 28];
    const rain = [0, 3, 14, 0, 0, 0, 1];
    const wind = [14, 20, 38, 18, 54, 10, 22];
    return {
      timestamp: (today.getTime() + day * 86_400_000) / 1000,
      temperatureC: temperatures[day], precipitationMm: rain[day], precipitationProbability: rain[day] ? 72 : 12,
      windKph: wind[day], icon: rain[day] ? "🌧️" : day === 3 ? "☀️" : day === 5 ? "❄️" : "⛅",
      summary: rain[day] > 10 ? "Heavy rain" : wind[day] > 50 ? "High wind" : temperatures[day] > 40 ? "Heatwave" : temperatures[day] < 0 ? "Frost risk" : "Partly cloudy",
    };
  });
}

function formatDay(date: string) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00`));
}

export function WeatherPlanner() {
  const [forecast, setForecast] = useState<DailyForecast[]>(() => buildDailyForecast(demoPeriods()));
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/weather/forecast", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Forecast unavailable")))
      .then((periods: ForecastPeriod[]) => { setForecast(buildDailyForecast(periods)); setIsLive(true); })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const alerts = forecast.filter((day) => day.severity === "adverse");
  return <section aria-labelledby="weather-planner-title" className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div><h2 id="weather-planner-title" className="text-xl font-bold">7-day field weather planner</h2><p className="text-sm text-zinc-500">{isLive ? "Live farm forecast" : "Forecast preview"} · updated every 30 minutes</p></div>
      <div className="flex gap-3 text-xs"><span><i className="mr-1 inline-block size-2 rounded-full bg-amber-400" />Caution</span><span><i className="mr-1 inline-block size-2 rounded-full bg-red-500" />Adverse</span></div>
    </div>
    {alerts.length > 0 && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100"><strong>Planner alert:</strong> {alerts.map((day) => `${formatDay(day.date)} (${day.conditions.join(", ")})`).join(" · ")}. Schedule sensitive field work before these conditions.</div>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
      {forecast.map((day) => <article key={day.date} className={`rounded-xl border p-4 ${severityStyles[day.severity]}`}>
        <div className="flex items-start justify-between"><p className="text-sm font-semibold">{formatDay(day.date)}</p><span aria-hidden className="text-2xl">{day.icon}</span></div>
        <p className="mt-3 text-2xl font-bold">{day.highC}° <span className="text-base font-medium opacity-65">/ {day.lowC}°</span></p>
        <p className="mt-1 text-xs font-medium">{severityLabel[day.severity]} · {day.summary}</p>
        <dl className="mt-3 space-y-1 text-xs"><div className="flex justify-between"><dt>Rain chance</dt><dd>{day.precipitationProbability}%</dd></div><div className="flex justify-between"><dt>Rainfall</dt><dd>{day.precipitationMm} mm/h</dd></div><div className="flex justify-between"><dt>Wind</dt><dd>{day.windKph} km/h</dd></div></dl>
      </article>)}
    </div>
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"><h3 className="font-semibold">Field activity calendar overlay</h3><p className="mt-1 text-sm text-zinc-500">Yellow days need caution. Red days have an adverse-weather alert and should be reviewed 24 hours ahead.</p><div className="mt-3 grid grid-cols-7 gap-2">{forecast.map((day) => <div key={day.date} className={`rounded-md border p-2 text-center text-xs ${severityStyles[day.severity]}`}><b className="block">{new Date(`${day.date}T12:00:00`).getDate()}</b><span>{day.icon}</span></div>)}</div></div>
  </section>;
}
