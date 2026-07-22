"use client";

/**
 * Individual crop price display card with sparkline.
 *
 * Displays:
 *  - Current oracle price with relative "last updated" timestamp
 *  - 24-hour change (color-coded green/red)
 *  - Mini SVG sparkline showing 7-day trend
 *  - Yearly high/low indicators
 *  - Stale data warning (yellow border when data > 60s old)
 *  - Click to select for detailed chart view
 */

import { useMemo } from "react";
import { Sparkline } from "@/src/components/dashboard/Sparkline";
import type { PriceTick, OHLCBar, DataFreshness } from "@/src/types/prices";

export interface PriceFeedCardProps {
  /** The price tick data for this crop pair. */
  tick: PriceTick;
  /** Whether this card is currently selected (for chart drill-down). */
  isSelected?: boolean;
  /** Click handler to select this pair for the detailed chart. */
  onSelect?: (pair: string) => void;
  /** Data freshness for this pair. */
  freshness?: DataFreshness;
  /** OHLC data for sparkline (optional, falls back to empty). */
  ohlcBars?: OHLCBar[];
  /** CSS class override. */
  className?: string;
}

/** Format a relative time string from a unix-ms timestamp. */
function relativeTime(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function PriceFeedCard({
  tick,
  isSelected = false,
  onSelect,
  freshness,
  ohlcBars,
  className = "",
}: PriceFeedCardProps) {
  const isStale = freshness?.isStale ?? false;
  const lastUpdatedTime = freshness?.lastUpdatedAt
    ? relativeTime(freshness.lastUpdatedAt)
    : null;

  // Compute 24h change display
  const change = parseFloat(tick.change24h);
  const isPositive = change > 0;
  const isNegative = change < 0;

  // Compute sparkline from OHLC closing prices (last 7 days)
  const sparklineData = useMemo(() => {
    if (!ohlcBars || ohlcBars.length === 0) return [];
    return ohlcBars.slice(-7).map((b) => b.close);
  }, [ohlcBars]);

  const handleClick = () => {
    onSelect?.(tick.pair);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.(tick.pair);
    }
  };

  return (
    <div
      className={`rounded-xl border p-4 transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
        isSelected
          ? "border-emerald-500 bg-emerald-50/50 shadow-md dark:border-emerald-400 dark:bg-emerald-900/20"
          : isStale
            ? "border-amber-300 bg-amber-50/30 dark:border-amber-600 dark:bg-amber-900/10"
            : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
      } ${className}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`${tick.crop} price card: $${parseFloat(tick.price).toFixed(2)}`}
    >
      {/* Header: crop name + freshness */}
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {tick.crop}
        </h3>
        <div className="flex items-center gap-2">
          {isStale && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              title="Price data may be outdated"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              Stale
            </span>
          )}
          {lastUpdatedTime && !isStale && (
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
              {lastUpdatedTime}
            </span>
          )}
        </div>
      </div>

      {/* Price + change */}
      <div className="mb-3 flex items-baseline justify-between">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
            ${parseFloat(tick.price).toFixed(2)}
          </span>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            {tick.currency}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Sparkline data={sparklineData} width={64} height={20} />
        </div>
      </div>

      {/* 24h change */}
      <div className="mb-2 flex items-center gap-1">
        <span
          className={`inline-flex items-center gap-0.5 text-xs font-medium tabular-nums ${
            isPositive
              ? "text-emerald-600 dark:text-emerald-400"
              : isNegative
                ? "text-red-600 dark:text-red-400"
                : "text-zinc-400 dark:text-zinc-500"
          }`}
        >
          {isPositive ? "▲" : isNegative ? "▼" : "—"}{" "}
          {Math.abs(change * 100).toFixed(2)}%
        </span>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
          24h
        </span>
      </div>

      {/* High / Low bar */}
      <div className="flex items-center justify-between text-[10px] text-zinc-400 dark:text-zinc-500">
        <span>
          L: ${parseFloat(tick.low24h).toFixed(2)}
        </span>
        {/* Mini range bar */}
        <div className="mx-1 h-1 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800">
          {(() => {
            const low = parseFloat(tick.low24h);
            const high = parseFloat(tick.high24h);
            const current = parseFloat(tick.price);
            const range = high - low || 1;
            const pct = Math.max(0, Math.min(100, ((current - low) / range) * 100));
            return (
              <div
                className="h-full rounded-full bg-emerald-500/60 dark:bg-emerald-400/60"
                style={{ width: `${pct}%` }}
              />
            );
          })()}
        </div>
        <span>
          H: ${parseFloat(tick.high24h).toFixed(2)}
        </span>
      </div>

      {/* Pair code badge */}
      <div className="mt-2 flex items-center gap-2">
        <span className="inline-block rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          {tick.pair}
        </span>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
          Vol: {parseFloat(tick.volume24h).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
      </div>
    </div>
  );
}
