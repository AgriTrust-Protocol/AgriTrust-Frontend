// src/utils/rowHeightEstimator.test.ts
import { describe, expect, it } from "vitest";
import { RowHeightEstimator } from "./rowHeightEstimator";

describe("RowHeightEstimator", () => {
  it("starts every index at the initial estimate", () => {
    const est = new RowHeightEstimator(10, 64);
    for (let i = 0; i < 10; i++) {
      expect(est.getEstimate(i)).toBe(64);
      expect(est.hasMeasured(i)).toBe(false);
    }
    expect(est.totalHeight()).toBe(640);
  });

  it("trusts the first real measurement outright, then blends via EMA (alpha=0.3)", () => {
    const est = new RowHeightEstimator(5, 64, 0.3);

    est.applyMeasurement(2, 120);
    expect(est.getEstimate(2)).toBe(120);
    expect(est.hasMeasured(2)).toBe(true);

    // Second measurement blends: 0.3*100 + 0.7*120 = 114
    est.applyMeasurement(2, 100);
    expect(est.getEstimate(2)).toBeCloseTo(114, 5);
  });

  it("clamps measurements to the 48-200px bounds", () => {
    const est = new RowHeightEstimator(3, 64);
    est.applyMeasurement(0, 10); // below MIN_ROW_HEIGHT
    est.applyMeasurement(1, 500); // above MAX_ROW_HEIGHT
    expect(est.getEstimate(0)).toBe(48);
    expect(est.getEstimate(1)).toBe(200);
  });

  it("offsetOf and totalHeight reflect real measurements", () => {
    const est = new RowHeightEstimator(4, 50);
    est.applyMeasurement(0, 100);
    est.applyMeasurement(1, 60);
    // index 2 and 3 stay at the 50px estimate

    expect(est.offsetOf(0)).toBe(0);
    expect(est.offsetOf(1)).toBe(100);
    expect(est.offsetOf(2)).toBe(160);
    expect(est.offsetOf(3)).toBe(210);
    expect(est.totalHeight()).toBe(260);
  });

  it("indexAtOffset finds the row containing a given scroll offset", () => {
    const est = new RowHeightEstimator(5, 50);
    est.applyMeasurement(0, 100); // [0, 100)
    est.applyMeasurement(1, 50); // [100, 150)
    est.applyMeasurement(2, 200); // [150, 350)
    // indices 3, 4 stay at 50 each: [350,400), [400,450)

    expect(est.indexAtOffset(0)).toBe(0);
    expect(est.indexAtOffset(99)).toBe(0);
    expect(est.indexAtOffset(100)).toBe(1);
    expect(est.indexAtOffset(200)).toBe(2);
    expect(est.indexAtOffset(360)).toBe(3);
    expect(est.indexAtOffset(10_000)).toBe(4); // clamps to last index
  });

  it("prepend shifts existing estimates and preserves their values", () => {
    const est = new RowHeightEstimator(3, 50);
    est.applyMeasurement(0, 90);
    est.applyMeasurement(1, 70);
    est.applyMeasurement(2, 60);

    est.prepend(2);

    expect(est.size).toBe(5);
    // What was index 0 (90px) is now index 2, etc.
    expect(est.getEstimate(2)).toBe(90);
    expect(est.getEstimate(3)).toBe(70);
    expect(est.getEstimate(4)).toBe(60);
    // New leading slots use the initial estimate and are unmeasured.
    expect(est.getEstimate(0)).toBe(50);
    expect(est.hasMeasured(0)).toBe(false);
    expect(est.offsetOf(2)).toBe(100); // 50 + 50 for the two new leading rows
  });

  it("resize grows the array while preserving existing estimates", () => {
    const est = new RowHeightEstimator(2, 50);
    est.applyMeasurement(0, 80);
    est.resize(4);

    expect(est.size).toBe(4);
    expect(est.getEstimate(0)).toBe(80);
    expect(est.getEstimate(2)).toBe(50);
    expect(est.getEstimate(3)).toBe(50);
  });

  it("handles 100,000 rows with O(log n)-scale offset/index lookups", () => {
    const N = 100_000;
    const est = new RowHeightEstimator(N, 64);

    // Measure a scattered sample of rows with varying heights, like a real
    // scroll session would (only rows near the viewport ever get measured).
    for (let i = 0; i < N; i += 137) {
      est.applyMeasurement(i, 48 + (i % 153));
    }

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      const offset = (i / 1000) * est.totalHeight();
      const idx = est.indexAtOffset(offset);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(N);
    }
    const elapsed = performance.now() - start;

    // 1000 binary-search lookups over 100k rows should be near-instant;
    // generous budget for a CI machine.
    expect(elapsed).toBeLessThan(200);
  });
});
