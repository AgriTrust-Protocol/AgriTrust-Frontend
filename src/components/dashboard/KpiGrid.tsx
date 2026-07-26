"use client";

/**
 * Farm-level KPI grid with trend indicators.
 *
 * Displays key performance indicators:
 *  - Current price (vs 24h ago)
 *  - 7d trend (SVG sparkline)
 *  - Yearly high/low
 *  - Open interest / volume
 *
 * Each KPI card shows its current value, 24h change (color-coded), and a
 * sparkline mini-chart.  Cards are laid out in a responsive grid.
 */

import { Sparkline } from "@/src/components/dashboard/Sparkline";
import { InternationalizedText } from "@/src/components/common/InternationalizedText";
import type { FarmKpi } from "@/src/types/prices";

export interface KpiGridProps {
  /** Array of KPI metrics to display. */
  kpis: FarmKpi[];
  /** CSS class override. */
  className?: string;
}

/** Trend arrow icon based on trend direction. */
function TrendIcon({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "up") {
    return (
      <svg className="h-3 w-3 text-emerald-500" viewBox="0 0 12 12" fill="none">
        <path
          d="M6 2.5L9.5 6L8.2 6L8.2 9.5L3.8 9.5L3.8 6L2.5 6L6 2.5Z"
          fill="currentColor"
        />
      </svg>
    );
  }
  if (trend === "down") {
    return (
      <svg className="h-3 w-3 text-red-500" viewBox="0 0 12 12" fill="none">
        <path
          d="M6 9.5L2.5 6L3.8 6L3.8 2.5L8.2 2.5L8.2 6L9.5 6L6 9.5Z"
          fill="currentColor"
        />
      </svg>
    );
  }
  return (
    <svg className="h-3 w-3 text-zinc-400" viewBox="0 0 12 12" fill="none">
      <rect x="2" y="5" width="8" height="2" rx="1" fill="currentColor" />
    </svg>
  );
}

export function KpiGrid({ kpis, className = "" }: KpiGridProps) {
  if (kpis.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-zinc-200 p-8 dark:border-zinc-800 ${className}`}
      >
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          <InternationalizedText id="dashboard.kpi.noData" />
        </p>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>
      {kpis.map((kpi) => {
        const change = parseFloat(kpi.change24h);
        const isPositive = change > 0;
        const isNegative = change < 0;

        return (
          <div
            key={kpi.id}
            className="group rounded-xl border border-zinc-200 bg-white p-5 transition-all duration-200 hover:border-zinc-300 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
          >
            {/* Label */}
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {kpi.label}
              </span>
              <TrendIcon trend={kpi.trend} />
            </div>

            {/* Value */}
            <div className="mb-2 flex items-baseline gap-1">
              <span className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                {kpi.value}
              </span>
              {kpi.unit && (
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  {kpi.unit}
                </span>
              )}
            </div>

            {/* 24h change */}
            {kpi.change24h !== "0" && (
              <div className="mb-3 flex items-center gap-1">
                <span
                  className={`text-xs font-medium tabular-nums ${
                    isPositive
                      ? "text-emerald-600 dark:text-emerald-400"
                      : isNegative
                        ? "text-red-600 dark:text-red-400"
                        : "text-zinc-400 dark:text-zinc-500"
                  }`}
                >
                  {isPositive ? "+" : ""}
                  {(change * 100).toFixed(2)}%
                </span>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                  vs 24h ago
                </span>
              </div>
            )}

            {/* Sparkline */}
            {kpi.sparkline.length > 0 && (
              <div className="flex items-center justify-end">
                <Sparkline
                  data={kpi.sparkline}
                  width={100}
                  height={28}
                  className="opacity-70 transition-opacity group-hover:opacity-100"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
