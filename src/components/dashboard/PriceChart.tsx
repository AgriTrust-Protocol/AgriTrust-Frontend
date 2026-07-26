"use client";

/**
 * Interactive price chart with time range selector.
 *
 * Uses recharts for lightweight canvas-based rendering. Displays:
 *  - Close price trend line (green/red based on period direction)
 *  - High-Low range area (semi-transparent fill)
 *  - Volume bars below the main chart
 *  - Rich crosshair tooltip showing O/H/L/C/Volume
 *  - Time range selector: 1d, 5d, 1m, 3m, 1y, All
 *
 * Responsive: fills parent container via ResponsiveContainer.
 */

import { useMemo, useCallback } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { InternationalizedText } from "@/src/components/common/InternationalizedText";
import type { OHLCBar, ChartTimeRange } from "@/src/types/prices";

// ── Constants ──────────────────────────────────────────────────────────────

const RANGE_OPTIONS: { value: ChartTimeRange; label: string }[] = [
  { value: "1d", label: "1D" },
  { value: "5d", label: "5D" },
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
  { value: "1y", label: "1Y" },
  { value: "all", label: "All" },
];

const CHART_COLORS = {
  up: "#10b981",    // Emerald-500
  down: "#ef4444",  // Red-500
  volume: "#6b7280", // Gray-500 (opacity applied in component)
};

// ── Helpers ────────────────────────────────────────────────────────────────

interface ChartDatum extends OHLCBar {
  /** Short date label for X axis. */
  label: string;
}

function formatOHLCForChart(bars: OHLCBar[]): ChartDatum[] {
  return bars.map((bar) => ({
    ...bar,
    label: bar.date.slice(5), // "MM-DD" format
  }));
}

/** Filter bars based on the selected time range. */
function filterByRange(bars: ChartDatum[], range: ChartTimeRange): ChartDatum[] {
  if (range === "all") return bars;

  const now = new Date();
  const thresholds: Record<Exclude<ChartTimeRange, "all">, number> = {
    "1d": 1,
    "5d": 5,
    "1m": 30,
    "3m": 90,
    "1y": 365,
  };

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - thresholds[range]);

  return bars.filter((bar) => new Date(bar.date) >= cutoff);
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartDatum }>;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const d = payload[0].payload;
  const isUp = d.close >= d.open;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {d.date}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs tabular-nums">
        <span className="text-zinc-400">Open:</span>
        <span className="text-zinc-900 dark:text-zinc-100">
          ${d.open.toFixed(2)}
        </span>
        <span className="text-zinc-400">High:</span>
        <span className="text-emerald-600 dark:text-emerald-400">
          ${d.high.toFixed(2)}
        </span>
        <span className="text-zinc-400">Low:</span>
        <span className="text-red-600 dark:text-red-400">
          ${d.low.toFixed(2)}
        </span>
        <span className="text-zinc-400">Close:</span>
        <span
          className={
            isUp
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }
        >
          ${d.close.toFixed(2)}
        </span>
        <span className="text-zinc-400">Vol:</span>
        <span className="text-zinc-900 dark:text-zinc-100">
          {d.volume.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export interface PriceChartProps {
  /** OHLC bars for the selected pair. */
  bars: OHLCBar[];
  /** Currently selected time range. */
  range: ChartTimeRange;
  /** Time range change handler. */
  onRangeChange: (range: ChartTimeRange) => void;
  /** The crop pair label (e.g., "Corn / USD"). */
  pairLabel?: string;
  /** CSS class override. */
  className?: string;
}

export function PriceChart({
  bars,
  range,
  onRangeChange,
  pairLabel,
  className = "",
}: PriceChartProps) {
  const allChartData = useMemo(() => formatOHLCForChart(bars), [bars]);
  const chartData = useMemo(
    () => filterByRange(allChartData, range),
    [allChartData, range],
  );

  // Trend color: green if last close >= first close, red otherwise
  const trendColor = useMemo(() => {
    if (chartData.length < 2) return CHART_COLORS.up;
    const first = chartData[0].close;
    const last = chartData[chartData.length - 1].close;
    return last >= first ? CHART_COLORS.up : CHART_COLORS.down;
  }, [chartData]);

  // Y-axis domain with padding
  const yDomain = useMemo((): [number, number] => {
    if (chartData.length === 0) return [0, 100];
    const highs = chartData.map((d) => d.high);
    const lows = chartData.map((d) => d.low);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const padding = (max - min) * 0.05 || max * 0.01;
    return [Math.max(0, min - padding), max + padding];
  }, [chartData]);

  const handleRangeClick = useCallback(
    (value: ChartTimeRange) => {
      onRangeChange(value);
    },
    [onRangeChange],
  );

  if (bars.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-zinc-200 p-6 dark:border-zinc-800 ${className}`}
        style={{ minHeight: 400 }}
      >
        <div className="text-center">
          <svg
            className="mx-auto mb-3 h-10 w-10 text-zinc-300 dark:text-zinc-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 3v18h18M7 16l4-8 4 4 4-6"
            />
          </svg>
          <p className="text-sm text-zinc-400 dark:text-zinc-500">
            Select a crop pair to view price history
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-zinc-200 p-6 dark:border-zinc-800 ${className}`}
    >
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <InternationalizedText
            as="h3"
            id="dashboard.priceChart.title"
            className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500"
          />
          {pairLabel && (
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {pairLabel}
            </p>
          )}
        </div>

        {/* Range selector */}
        <div className="flex items-center gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleRangeClick(opt.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                range === opt.value
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main price chart: High-Low range area + Close line */}
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart
          data={chartData}
          margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            className="text-zinc-200 dark:text-zinc-800"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "currentColor" }}
            stroke="currentColor"
            className="text-zinc-400 dark:text-zinc-500"
            interval="preserveStartEnd"
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "currentColor" }}
            stroke="currentColor"
            className="text-zinc-400 dark:text-zinc-500"
            domain={yDomain}
            tickFormatter={(v: number) => `$${v.toFixed(2)}`}
            width={70}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3" }} />

          {/* High-Low range as a semi-transparent area */}
          <Area
            type="monotone"
            dataKey="high"
            stroke="none"
            fill={trendColor}
            fillOpacity={0.08}
            isAnimationActive={false}
            name="High-Low Range"
          />
          <Area
            type="monotone"
            dataKey="low"
            stroke="none"
            fill={trendColor}
            fillOpacity={0.08}
            isAnimationActive={false}
          />

          {/* Close price line */}
          <Line
            type="monotone"
            dataKey="close"
            stroke={trendColor}
            strokeWidth={2}
            dot={false}
            activeDot={{
              r: 4,
              strokeWidth: 2,
              stroke: "white",
              fill: trendColor,
            }}
            isAnimationActive={false}
            name="Close"
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Volume histogram below — shares the same data so X-axis aligns */}
      <ResponsiveContainer width="100%" height={48}>
        <BarChart data={chartData}>
          <Bar
            dataKey="volume"
            fill={CHART_COLORS.volume}
            fillOpacity={0.25}
            radius={[1, 1, 0, 0]}
            isAnimationActive={false}
            name="Volume"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
