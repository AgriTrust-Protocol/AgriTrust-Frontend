/**
 * Tests for trustScoreFormat.ts and the Percent class.
 *
 * Covers:
 *  - Boundary conditions: 0, 1, 10^18, intermediate values
 *  - The 100× rounding bug is NOT present (primary regression guard)
 *  - Tier labels and colour classes
 *  - Percent.fromNumber() interop
 *  - Property-based: 1000 random scores in [0, 10^18]
 *  - Max rounding error invariant: |display - exact| ≤ 0.01 pp
 */

import { describe, it, expect } from "vitest";
import {
  formatTrustScore,
  formatTrustScoreNumeric,
  formatTrustScoreFromNumber,
  getTrustScoreLabel,
  getTrustScoreColorClass,
  isValidRawScore,
} from "@/src/utils/format/trustScoreFormat";
import { Percent, TRUST_SCORE_SCALE } from "@/src/utils/format/Percent";

// ── Helpers ───────────────────────────────────────────────────────────────

/** Compute exact display percentage as a float (reference implementation). */
function exactPct(rawScore: bigint): number {
  return (Number(rawScore) / 1e18) * 100;
}

/** Parse "85.00%" → 85.00 */
function parsePct(s: string): number {
  return parseFloat(s.replace("%", ""));
}

// ── Boundary condition tests ──────────────────────────────────────────────

describe("formatTrustScore — boundary conditions", () => {
  it("score = 0n → '0.00%'", () => {
    expect(formatTrustScore(0n)).toBe("0.00%");
  });

  it("score = 10^18n → '100.00%'", () => {
    expect(formatTrustScore(TRUST_SCORE_SCALE)).toBe("100.00%");
  });

  it("score = 1n → '0.00%' (below display threshold)", () => {
    // 1 / 10^18 * 100 = 1e-16% — rounds to 0.00 at 2 dp
    expect(formatTrustScore(1n)).toBe("0.00%");
  });

  it("score = 10^17n → '10.00%'", () => {
    // 10% of max
    expect(formatTrustScore(10n ** 17n)).toBe("10.00%");
  });

  it("score = 8.5 × 10^17n → '85.00%'  (regression: must NOT be '0.85%')", () => {
    const score = 850_000_000_000_000_000n;
    const result = formatTrustScore(score);
    // Primary regression guard — the 100× bug produces "0.85%"
    expect(result).not.toBe("0.85%");
    expect(result).toBe("85.00%");
  });

  it("score = 5 × 10^17n → '50.00%'", () => {
    expect(formatTrustScore(500_000_000_000_000_000n)).toBe("50.00%");
  });

  it("score = 10^16n → '1.00%'", () => {
    // 10^16 / 10^18 * 100 = 1%
    expect(formatTrustScore(10_000_000_000_000_000n)).toBe("1.00%");
  });

  it("score = 10^14n → '0.01%' (minimum visible BPS)", () => {
    // 10^14 / 10^18 * 100 = 0.01%
    expect(formatTrustScore(100_000_000_000_000n)).toBe("0.01%");
  });
});

// ── Numeric format ────────────────────────────────────────────────────────

describe("formatTrustScoreNumeric", () => {
  it("returns the numeric string without % suffix", () => {
    expect(formatTrustScoreNumeric(850_000_000_000_000_000n)).toBe("85.00");
    expect(formatTrustScoreNumeric(0n)).toBe("0.00");
    expect(formatTrustScoreNumeric(TRUST_SCORE_SCALE)).toBe("100.00");
  });
});

// ── Legacy number interop ─────────────────────────────────────────────────

describe("formatTrustScoreFromNumber", () => {
  it("converts 85 → '85.00%'", () => {
    expect(formatTrustScoreFromNumber(85)).toBe("85.00%");
  });

  it("converts 0 → '0.00%'", () => {
    expect(formatTrustScoreFromNumber(0)).toBe("0.00%");
  });

  it("converts 100 → '100.00%'", () => {
    expect(formatTrustScoreFromNumber(100)).toBe("100.00%");
  });

  it("clamps values > 100 to 100.00%", () => {
    expect(formatTrustScoreFromNumber(150)).toBe("100.00%");
  });

  it("clamps negative values to 0.00%", () => {
    expect(formatTrustScoreFromNumber(-5)).toBe("0.00%");
  });
});

// ── Tier labels ───────────────────────────────────────────────────────────

describe("getTrustScoreLabel", () => {
  it("≥ 80% → 'High'", () => {
    expect(getTrustScoreLabel(800_000_000_000_000_000n)).toBe("High");
    expect(getTrustScoreLabel(TRUST_SCORE_SCALE)).toBe("High");
  });

  it("50–79% → 'Medium'", () => {
    expect(getTrustScoreLabel(500_000_000_000_000_000n)).toBe("Medium");
    expect(getTrustScoreLabel(790_000_000_000_000_000n)).toBe("Medium");
  });

  it("< 50% → 'Low'", () => {
    expect(getTrustScoreLabel(0n)).toBe("Low");
    expect(getTrustScoreLabel(499_000_000_000_000_000n)).toBe("Low");
  });
});

// ── Colour classes ────────────────────────────────────────────────────────

describe("getTrustScoreColorClass", () => {
  it("High → emerald class", () => {
    const cls = getTrustScoreColorClass(850_000_000_000_000_000n);
    expect(cls).toContain("emerald");
  });

  it("Medium → amber class", () => {
    const cls = getTrustScoreColorClass(600_000_000_000_000_000n);
    expect(cls).toContain("amber");
  });

  it("Low → red class", () => {
    const cls = getTrustScoreColorClass(200_000_000_000_000_000n);
    expect(cls).toContain("red");
  });
});

// ── isValidRawScore ───────────────────────────────────────────────────────

describe("isValidRawScore", () => {
  it("accepts 0", () => expect(isValidRawScore(0n)).toBe(true));
  it("accepts 10^18", () => expect(isValidRawScore(TRUST_SCORE_SCALE)).toBe(true));
  it("accepts mid-range", () => expect(isValidRawScore(500_000_000_000_000_000n)).toBe(true));
  it("rejects negative", () => expect(isValidRawScore(-1n)).toBe(false));
  it("rejects > 10^18", () => expect(isValidRawScore(TRUST_SCORE_SCALE + 1n)).toBe(false));
});

// ── Percent class ─────────────────────────────────────────────────────────

describe("Percent class", () => {
  it("fromRawScore — known values", () => {
    expect(Percent.fromRawScore(0n).toDisplayString()).toBe("0.00%");
    expect(Percent.fromRawScore(TRUST_SCORE_SCALE).toDisplayString()).toBe("100.00%");
    expect(Percent.fromRawScore(850_000_000_000_000_000n).toDisplayString()).toBe("85.00%");
  });

  it("clamps out-of-range bigint > 10^18 to 100.00%", () => {
    expect(Percent.fromRawScore(TRUST_SCORE_SCALE * 2n).toDisplayString()).toBe("100.00%");
  });

  it("fromNumber — round-trip", () => {
    expect(Percent.fromNumber(42.5).toDisplayString()).toBe("42.50%");
    expect(Percent.fromNumber(0).toDisplayString()).toBe("0.00%");
    expect(Percent.fromNumber(100).toDisplayString()).toBe("100.00%");
  });

  it("toBasisPoints returns correct BPS", () => {
    // 85% = 8500 BPS
    expect(Percent.fromRawScore(850_000_000_000_000_000n).toBasisPoints()).toBe(8500n);
    // 100% = 10000 BPS
    expect(Percent.fromRawScore(TRUST_SCORE_SCALE).toBasisPoints()).toBe(10_000n);
  });

  it("toFloat returns numeric value", () => {
    expect(Percent.fromRawScore(850_000_000_000_000_000n).toFloat()).toBeCloseTo(85, 1);
  });
});

// ── Property-based test — 1000 random scores ─────────────────────────────

describe("Property-based: formatTrustScore(score) within 0.01pp of exact", () => {
  it("passes for 1000 random scores in [0, 10^18]", () => {
    // Simple deterministic LCG for reproducible randomness (no external lib)
    let seed = 0xdeadbeefn;
    const MAX = TRUST_SCORE_SCALE;

    function nextRand(): bigint {
      // LCG: x = (a*x + c) mod m  with 64-bit state
      seed = (6364136223846793005n * seed + 1442695040888963407n) & 0xFFFFFFFFFFFFFFFFn;
      // Map to [0, 10^18]
      return (seed * MAX) / 0xFFFFFFFFFFFFFFFFn;
    }

    for (let i = 0; i < 1000; i++) {
      const score = nextRand();
      const displayed = parsePct(formatTrustScore(score));
      const exact = exactPct(score);

      // Allow ≤ 0.01 percentage-point rounding error (per invariant)
      expect(Math.abs(displayed - exact)).toBeLessThanOrEqual(0.01);

      // Also assert no score is reported as 0.xx% when it should be xx.00%
      // (catches the 100× regression for scores > 1%)
      if (score > 10_000_000_000_000_000n) {
        // > 1%: displayed value must be ≥ 1
        expect(displayed).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

// ── Regression: 100× off-by-one guard ────────────────────────────────────

describe("Regression: 100× scaling error must not occur", () => {
  const CASES: Array<{ score: bigint; expected: string; wrong: string }> = [
    {
      score: 850_000_000_000_000_000n,
      expected: "85.00%",
      wrong: "0.85%",
    },
    {
      score: 500_000_000_000_000_000n,
      expected: "50.00%",
      wrong: "0.50%",
    },
    {
      score: 100_000_000_000_000_000n,
      expected: "10.00%",
      wrong: "0.10%",
    },
    {
      score: TRUST_SCORE_SCALE,
      expected: "100.00%",
      wrong: "1.00%",
    },
  ];

  for (const { score, expected, wrong } of CASES) {
    it(`score=${score}n → "${expected}" (not "${wrong}")`, () => {
      const result = formatTrustScore(score);
      expect(result).toBe(expected);
      expect(result).not.toBe(wrong);
    });
  }
});
