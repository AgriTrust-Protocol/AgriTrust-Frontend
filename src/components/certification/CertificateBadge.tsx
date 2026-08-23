"use client";

/**
 * CertificateBadge
 *
 * Compact inline badge showing a certificate's status and trust score.
 * Designed to be embedded inside tables, lists, or detail panels.
 *
 * Trust score is displayed using `formatTrustScore()` which correctly
 * converts the on-chain u128 (18-decimal) value to a percentage string
 * via BigInt arithmetic — no floating-point 100× rounding error.
 */

import type { CertificationRecord } from "@/src/types/certification";
import {
  formatTrustScore,
  getTrustScoreLabel,
} from "@/src/utils/format/trustScoreFormat";

// ── Types ─────────────────────────────────────────────────────────────────

export interface CertificateBadgeProps {
  /**
   * Certificate record from the dashboard cache.
   * `trustScore` is the LEGACY number field (0–100).
   * For on-chain BigInt use `rawScore` prop instead.
   */
  record?: CertificationRecord;
  /**
   * On-chain raw score as bigint (u128, 18-decimal).
   * Takes priority over `record.trustScore` when supplied.
   */
  rawScore?: bigint;
  /** Show the full certificate ID alongside the badge. */
  showId?: boolean;
  /** CSS class override. */
  className?: string;
}

// ── Status badge config ───────────────────────────────────────────────────

type StatusStyle = { bg: string; text: string; label: string };

const STATUS_STYLES: Record<string, StatusStyle> = {
  issued: {
    bg: "bg-blue-100 dark:bg-blue-900/40",
    text: "text-blue-700 dark:text-blue-300",
    label: "Issued",
  },
  verified: {
    bg: "bg-emerald-100 dark:bg-emerald-900/40",
    text: "text-emerald-700 dark:text-emerald-300",
    label: "Verified",
  },
  revoked: {
    bg: "bg-red-100 dark:bg-red-900/40",
    text: "text-red-700 dark:text-red-300",
    label: "Revoked",
  },
  expired: {
    bg: "bg-zinc-100 dark:bg-zinc-800",
    text: "text-zinc-600 dark:text-zinc-400",
    label: "Expired",
  },
};

const SCORE_COLOR: Record<"High" | "Medium" | "Low", string> = {
  High: "text-emerald-600 dark:text-emerald-400",
  Medium: "text-amber-600 dark:text-amber-400",
  Low: "text-red-600 dark:text-red-400",
};

// ── Component ─────────────────────────────────────────────────────────────

export function CertificateBadge({
  record,
  rawScore,
  showId = false,
  className = "",
}: CertificateBadgeProps) {
  // Resolve the display value — prefer the on-chain bigint, fall back to
  // the legacy number field scaled back to bigint via Percent interop.
  const resolvedRaw: bigint | null =
    rawScore !== undefined
      ? rawScore
      : record !== undefined
        ? BigInt(Math.round(record.trustScore * 1e16)) // legacy: pct * 10^16 → raw
        : null;

  const scoreDisplay =
    resolvedRaw !== null ? formatTrustScore(resolvedRaw) : "—";

  const tier =
    resolvedRaw !== null ? getTrustScoreLabel(resolvedRaw) : ("Low" as const);

  const scoreColorClass = SCORE_COLOR[tier];

  const status = record?.status ?? "issued";
  const statusStyle = STATUS_STYLES[status] ?? STATUS_STYLES.issued;

  return (
    <div
      className={`inline-flex items-center gap-2 ${className}`}
      aria-label={`Certificate${record ? ` ${record.id}` : ""}: ${status}, trust score ${scoreDisplay}`}
    >
      {/* Status chip */}
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusStyle.bg} ${statusStyle.text}`}
      >
        {statusStyle.label}
      </span>

      {/* Trust score */}
      <span
        className={`text-sm font-bold tabular-nums ${scoreColorClass}`}
        title={`Trust score: ${scoreDisplay}`}
      >
        {scoreDisplay}
      </span>

      {/* Optional cert ID */}
      {showId && record?.id && (
        <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
          {record.id.slice(0, 8)}…
        </span>
      )}
    </div>
  );
}
