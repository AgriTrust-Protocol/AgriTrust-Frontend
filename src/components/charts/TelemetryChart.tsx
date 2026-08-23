"use client";

/**
 * Inner chart renderer for the live telemetry view.
 *
 * Memoized with `React.memo`: it only re-renders when the parent's
 * time-batched buffer flushes new series data, not on every WebSocket
 * frame. Rendering is plain SVG to keep reconciliation cheap at the
 * ~2 renders/sec cadence.
 */

import { memo } from "react";

export interface TelemetrySeries {
  metric: string;
  values: number[];
}

export interface TelemetryChartProps {
  series: TelemetrySeries[];
  width?: number;
  height?: number;
}

const SERIES_COLORS = [
  "#10b981", // emerald
  "#f59e0b", // amber
  "#3b82f6", // blue
  "#ef4444", // red
];

function buildPath(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  return values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function TelemetryChartImpl({ series, width = 560, height = 180 }: TelemetryChartProps) {
  if (series.length === 0 || series.every((s) => s.values.length === 0)) {
    return (
      <div
        data-testid="telemetry-chart-empty"
        className="flex items-center justify-center rounded-xl border border-dashed border-zinc-300 p-10 text-sm text-zinc-400 dark:border-zinc-700 dark:text-zinc-500"
      >
        Waiting for telemetry frames...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <svg
        data-testid="telemetry-chart"
        viewBox={`0 0 ${width} ${height}`}
        className="w-full rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
        role="img"
        aria-label="Live cargo telemetry chart"
      >
        {series.map((s, index) => (
          <path
            key={s.metric}
            d={buildPath(s.values, width, height)}
            fill="none"
            stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s, index) => (
          <span
            key={s.metric}
            className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400"
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }}
            />
            {s.metric}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Memoized child: shallow prop comparison is sufficient because the
 * parent rebuilds `series` only when a batch is applied.
 */
export const TelemetryChart = memo(TelemetryChartImpl);
