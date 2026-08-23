/**
 * Percent — BigInt-based percentage value type.
 *
 * Internally stores the value as basis points (BPS) where 1 BPS = 0.01%.
 * This avoids floating-point precision errors when converting on-chain u128
 * values (18-decimal fixed-point) to human-readable percentages.
 *
 * On-chain precision contract:
 *   1.0 × 10^18  →  100.00%
 *   1.0 × 10^17  →   10.00%
 *   0            →    0.00%
 *
 * Internally:
 *   basisPoints = (rawScore × 10_000n) / 10^18n
 *   display%    = basisPoints / 100
 */

/** Number of on-chain decimals for the trust score u128 representation. */
export const TRUST_SCORE_DECIMALS = 18n;

/** Scaling factor: 10^18 */
export const TRUST_SCORE_SCALE = 10n ** TRUST_SCORE_DECIMALS;

/** 1 BPS = 0.01% — we store 4 decimal places worth of resolution. */
const BPS_FACTOR = 10_000n;

export class Percent {
  /** Internal storage: basis points (integer, 0–10_000 for 0–100%). */
  private readonly bps: bigint;

  private constructor(bps: bigint) {
    // Clamp to [0, 10_000] (0.00% – 100.00%)
    this.bps = bps < 0n ? 0n : bps > 10_000n ? 10_000n : bps;
  }

  /**
   * Create a Percent from an on-chain u128 trust score.
   *
   * Correct formula: (score × 10_000) / 10^18
   * This avoids the 100× off-by-one error that arises from dividing by 10^16.
   *
   * @param rawScore - On-chain score as bigint (range [0, 10^18])
   */
  static fromRawScore(rawScore: bigint): Percent {
    if (rawScore < 0n) return new Percent(0n);
    const bps = (rawScore * BPS_FACTOR) / TRUST_SCORE_SCALE;
    return new Percent(bps);
  }

  /**
   * Create a Percent from a plain JS number already in percentage form (0–100).
   * Used for interop with legacy `CertificationRecord.trustScore: number`.
   */
  static fromNumber(pct: number): Percent {
    const bps = BigInt(Math.round(Math.max(0, Math.min(100, pct)) * 100));
    return new Percent(bps);
  }

  /**
   * Returns the display string, e.g. "85.00" (no "%" suffix).
   * Rounds to 2 decimal places.
   */
  toDisplay(): string {
    const whole = this.bps / 100n;
    const frac = this.bps % 100n;
    return `${whole}.${frac.toString().padStart(2, "0")}`;
  }

  /**
   * Returns the full percentage string with "%" suffix, e.g. "85.00%".
   */
  toDisplayString(): string {
    return `${this.toDisplay()}%`;
  }

  /** Returns the numeric float value (0–100). Safe for comparison only. */
  toFloat(): number {
    return Number(this.bps) / 100;
  }

  /** Raw basis-point value for serialisation / equality checks. */
  toBasisPoints(): bigint {
    return this.bps;
  }
}
