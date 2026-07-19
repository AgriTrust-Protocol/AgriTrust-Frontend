export type WeatherSeverity = "normal" | "caution" | "adverse";

export type WeatherCondition = "rain" | "frost" | "heatwave" | "wind";

export interface ForecastPeriod {
  timestamp: number;
  temperatureC: number;
  precipitationMm: number;
  precipitationProbability: number;
  windKph: number;
  icon: string;
  summary: string;
}

export interface DailyForecast {
  date: string;
  highC: number;
  lowC: number;
  precipitationProbability: number;
  precipitationMm: number;
  windKph: number;
  icon: string;
  summary: string;
  conditions: WeatherCondition[];
  severity: WeatherSeverity;
}

export const WEATHER_THRESHOLDS = {
  rainMmPerHour: 10,
  frostC: 0,
  heatwaveC: 40,
  windKph: 50,
} as const;

export function getAdverseConditions(period: ForecastPeriod): WeatherCondition[] {
  const conditions: WeatherCondition[] = [];
  if (period.precipitationMm > WEATHER_THRESHOLDS.rainMmPerHour) conditions.push("rain");
  if (period.temperatureC < WEATHER_THRESHOLDS.frostC) conditions.push("frost");
  if (period.temperatureC > WEATHER_THRESHOLDS.heatwaveC) conditions.push("heatwave");
  if (period.windKph > WEATHER_THRESHOLDS.windKph) conditions.push("wind");
  return conditions;
}

export function getSeverity(period: ForecastPeriod): WeatherSeverity {
  const conditions = getAdverseConditions(period);
  if (conditions.length > 0) return "adverse";
  if (period.precipitationMm > 0 || period.windKph > 35) return "caution";
  return "normal";
}

/** Groups 3-hour forecast periods into the seven calendar days used by the planner. */
export function buildDailyForecast(periods: ForecastPeriod[]): DailyForecast[] {
  const byDate = new Map<string, ForecastPeriod[]>();
  for (const period of periods) {
    const date = new Date(period.timestamp * 1000).toISOString().slice(0, 10);
    byDate.set(date, [...(byDate.get(date) ?? []), period]);
  }

  return [...byDate.entries()].slice(0, 7).map(([date, dayPeriods]) => {
    const adversePeriods = dayPeriods.filter((period) => getSeverity(period) === "adverse");
    const representative = adversePeriods[0] ?? dayPeriods[Math.floor(dayPeriods.length / 2)];
    const conditions = [...new Set(dayPeriods.flatMap(getAdverseConditions))];
    const isCaution = dayPeriods.some((period) => getSeverity(period) === "caution");
    return {
      date,
      highC: Math.round(Math.max(...dayPeriods.map((period) => period.temperatureC))),
      lowC: Math.round(Math.min(...dayPeriods.map((period) => period.temperatureC))),
      precipitationProbability: Math.round(Math.max(...dayPeriods.map((period) => period.precipitationProbability))),
      precipitationMm: Math.max(...dayPeriods.map((period) => period.precipitationMm)),
      windKph: Math.round(Math.max(...dayPeriods.map((period) => period.windKph))),
      icon: representative.icon,
      summary: representative.summary,
      conditions,
      severity: conditions.length > 0 ? "adverse" : isCaution ? "caution" : "normal",
    };
  });
}
