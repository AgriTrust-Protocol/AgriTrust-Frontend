"use client";

/**
 * TrustScorePanel
 *
 * Displays a batch's on-chain trust score as a human-readable percentage
 * with a colour-coded tier badge and an animated progress bar.
 *
 * Trust score encoding (Soroban u128, 18 decimals):
 *   1.0 × 10^18  →  100.00%
 *   8.5 × 10^17  →   85.00%
 *   0            →    0.00%
 *
 * All formatting delegates to `formatTrustScore()` which uses BigInt
 * arithmetic — no floating-point 100× rounding error.
 */

import {
  formatTrustScore,
  formatTrustScoreNumeric,
  getTrustScoreLabel,
  getTrustScoreColorClass,
} from "@/src/utils/format/trustScoreFormat";
import { Percent, TRUST_SCORE_SCALE } from "@/src/utils/format/Percent";

// ── Types ─────────────────────────────────────────────────────────────────

export interface TrustScorePanelProps {
  /**
   * On-chain trust score as a bigint (u128, 18-decimal fixed-point).
   * Range: [0, 10^18].
   */
  rawScore: bigint;
  /** Optional label for the batch / certificate. */
  batchLabel?: string;
  /** CSS class override for the root element. */
  className?: string;
  /** Whether to show the numeric percentage text. Defaults to true. */
  showValue?: boolean;
  /** Whether to show the tier badge (High / Medium / Low). Defaults to true. */
  showBadge?: boolean;
  /** Whether to show the progress bar. Defaults to true. */
  showBar?: boolean;
}

// ── Tier badge config ─────────────────────────────────────────────────────

const TIER_BADGE: Record<
  "High" | "Medium" | "Low",
  { bg: string; text: string; dot: string }
> = {
  High: {
    bg: "bg-emerald-100 dark:bg-emerald-900/40",
    text: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  Medium: {
    bg: "bg-amber-100 dark:bg-amber-900/40",
    text: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  Low: {
    bg: "bg-red-100 dark:bg-red-900/40",
    text: "text-red-700 dark:text-red-300",
    dot: "bg-red-500",
  },
};

const BAR_COLOR: Record<"High" | "Medium" | "Low", string> = {
  High: "bg-emerald-500",
  Medium: "bg-amber-500",
  Low: "bg-red-500",
};

// ── Component ─────────────────────────────────────────────────────────────

export function TrustScorePanel({
  rawScore,
  batchLabel,
  className = "",
  showValue = true,
  showBadge = true,
  showBar = true,
}: TrustScorePanelProps) {
  const displayPct = formatTrustScore(rawScore);
  const numericStr = formatTrustScoreNumeric(rawScore);
  const tier = getTrustScoreLabel(rawScore);
  const colorClass = getTrustScoreColorClass(rawScore);
  const badge = TIER_BADGE[tier];
  const barColor = BAR_COLOR[tier];

  // Progress bar width (0–100%)
  const barWidthPct = Percent.fromRawScore(rawScore).toFloat();
  const cappedWidth = Math.max(0, Math.min(100, barWidthPct));

  return (
    <div
      className={`rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900 ${className}`}
      role="region"
      aria-label={
        batchLabel
          ? `Trust score for ${batchLabel}: ${displayPct}`
          : `Trust score: ${displayPct}`
      }
    >
      {/* Header row */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {batchLabel ? `Trust Score — ${batchLabel}` : "Trust Score"}
        </span>

        {showBadge && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge.bg} ${badge.text}`}
            aria-label={`Trust tier: ${tier}`}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${badge.dot}`}
            />
            {tier}
          </span>
        )}
      </div>

      {/* Main value */}
      {showValue && (
        <div className="mb-3 flex items-baseline gap-1">
          <span
            className={`text-3xl font-bold tabular-nums ${colorClass}`}
            aria-label={`${numericStr} percent`}
          >
            {numericStr}
          </span>
          <span className="text-lg font-semibold text-zinc-400 dark:text-zinc-500">
            %
          </span>
        </div>
      )}

      {/* Progress bar */}
      {showBar && (
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
          role="progressbar"
          aria-valuenow={cappedWidth}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Trust score progress: ${displayPct}`}
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${cappedWidth}%` }}
          />
        </div>
      )}
    </div>
  );
}
