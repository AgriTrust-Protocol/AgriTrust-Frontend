/**
 * trustScoreFormat.ts
 *
 * Formatting utilities for on-chain trust scores.
 *
 * On-chain representation
 * ───────────────────────
 * The Soroban contract stores trust scores as u128 with 18 decimal places:
 *   1.0 × 10^18  →  100.00%
 *   8.5 × 10^17  →   85.00%
 *   0            →    0.00%
 *
 * ⚠️  Common pitfall — the 100× error
 * ─────────────────────────────────────
 * WRONG:  Number(score) / 1e16            → produces 0.85 for an 85% score
 * WRONG:  (Number(score) / 1e16).toFixed(2) → "0.85" displayed as "0.85%"
 *
 * CORRECT: (score × 10_000n) / 10^18n  (BigInt arithmetic, no float loss)
 *          then divide by 100 for the display decimal.
 *
 * The `Percent` class in ./Percent.ts encapsulates this logic.
 */

import { Percent, TRUST_SCORE_SCALE } from "@/src/utils/format/Percent";

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Convert an on-chain u128 trust score (bigint) to a percentage string.
 *
 * @param rawScore - bigint in [0, 10^18]
 * @returns        - e.g. "85.00%" for 8.5 × 10^17
 *
 * @example
 * formatTrustScore(850000000000000000n)  // "85.00%"
 * formatTrustScore(0n)                   // "0.00%"
 * formatTrustScore(10n ** 18n)           // "100.00%"
 */
export function formatTrustScore(rawScore: bigint): string {
  return Percent.fromRawScore(rawScore).toDisplayString();
}

/**
 * Convert an on-chain u128 trust score (bigint) to a plain numeric string
 * without the "%" suffix (useful for aria-valuenow / progress bars).
 *
 * @param rawScore - bigint in [0, 10^18]
 * @returns        - e.g. "85.00"
 */
export function formatTrustScoreNumeric(rawScore: bigint): string {
  return Percent.fromRawScore(rawScore).toDisplay();
}

/**
 * Convert a legacy JS-number trust score (0–100) to a percentage string.
 * Used for interop with `CertificationRecord.trustScore: number`.
 *
 * @param score - float in [0, 100]
 * @returns     - e.g. "85.00%"
 */
export function formatTrustScoreFromNumber(score: number): string {
  return Percent.fromNumber(score).toDisplayString();
}

/**
 * Human-readable label for a trust score tier.
 *
 * Tiers:
 *  ≥ 80%  → "High"   (emerald)
 *  ≥ 50%  → "Medium" (amber)
 *  < 50%  → "Low"    (red)
 */
export function getTrustScoreLabel(rawScore: bigint): "High" | "Medium" | "Low" {
  const pct = Percent.fromRawScore(rawScore).toFloat();
  if (pct >= 80) return "High";
  if (pct >= 50) return "Medium";
  return "Low";
}

/**
 * Tailwind CSS color token for a trust score.
 * Returns a string suitable for className interpolation.
 *
 *  High   → "text-emerald-600 dark:text-emerald-400"
 *  Medium → "text-amber-600   dark:text-amber-400"
 *  Low    → "text-red-600     dark:text-red-400"
 */
export function getTrustScoreColorClass(rawScore: bigint): string {
  const label = getTrustScoreLabel(rawScore);
  switch (label) {
    case "High":
      return "text-emerald-600 dark:text-emerald-400";
    case "Medium":
      return "text-amber-600 dark:text-amber-400";
    case "Low":
      return "text-red-600 dark:text-red-400";
  }
}

/**
 * Validate that a trust score is within the on-chain valid range [0, 10^18].
 */
export function isValidRawScore(rawScore: bigint): boolean {
  return rawScore >= 0n && rawScore <= TRUST_SCORE_SCALE;
}

// ── Dev-build assertion (tree-shaken in production) ───────────────────────

if (process.env.NODE_ENV !== "production") {
  const KNOWN_PAIRS: Array<[bigint, string]> = [
    [0n, "0.00%"],
    [10n ** 18n, "100.00%"],
    [850_000_000_000_000_000n, "85.00%"],
    [100_000_000_000_000_000n, "10.00%"],
    [500_000_000_000_000_000n, "50.00%"],
    [1n, "0.00%"], // below display threshold → rounds to 0.00%
  ];

  for (const [input, expected] of KNOWN_PAIRS) {
    const result = formatTrustScore(input);
    console.assert(
      result === expected,
      `[trustScoreFormat] format mismatch for ${input}: expected "${expected}", got "${result}"`,
    );
  }
}
