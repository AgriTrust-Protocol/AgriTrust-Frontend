// src/utils/rowHeightEstimator.ts

const DEFAULT_ALPHA = 0.3;
const MIN_ROW_HEIGHT = 48;
const MAX_ROW_HEIGHT = 200;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Binary indexed tree (Fenwick tree) over row heights. Plain prefix-sum
 * recomputation is O(n) per query, which is fine at hundreds of rows but
 * falls over at 100,000 — recomputing on every scroll frame would blow the
 * 16ms budget long before the row count did. A Fenwick tree gives O(log n)
 * for both "update one row's height" and "sum of all heights before index
 * i", which is what makes 60fps at 100k+ rows actually achievable here.
 */
class FenwickTree {
  private tree: Float64Array;
  private n: number;

  constructor(n: number) {
    this.n = n;
    this.tree = new Float64Array(n + 1);
  }

  get size(): number {
    return this.n;
  }

  /** Builds a tree filled with `value` at every index. O(n log n) once. */
  static filled(n: number, value: number): FenwickTree {
    const t = new FenwickTree(n);
    for (let i = 0; i < n; i++) t.add(i, value);
    return t;
  }

  /** Adds `delta` to the value at `index`. O(log n). */
  add(index: number, delta: number): void {
    for (let i = index + 1; i <= this.n; i += i & -i) {
      this.tree[i] += delta;
    }
  }

  /** Sum of values in [0, index). O(log n). */
  prefixSum(index: number): number {
    let sum = 0;
    for (let i = Math.min(index, this.n); i > 0; i -= i & -i) {
      sum += this.tree[i];
    }
    return sum;
  }

  /** Total sum of all values. O(log n). */
  total(): number {
    return this.prefixSum(this.n);
  }

  /**
   * Builds a new, larger tree from a value-lookup function, filling
   * trailing new slots with `fillValue`. O(n log n) — only called on
   * resize/prepend, never on a scroll frame.
   */
  grow(newN: number, fillValue: number, valueAt: (i: number) => number): FenwickTree {
    const next = new FenwickTree(newN);
    for (let i = 0; i < this.n; i++) next.add(i, valueAt(i));
    for (let i = this.n; i < newN; i++) next.add(i, fillValue);
    return next;
  }
}

/**
 * Tracks estimated row heights for a (potentially huge, 100k+) list.
 *
 * Per-index estimates live in a Float64Array (8 bytes/entry — 100,000 rows
 * costs ~800KB, versus a Map<number, number> which carries far more
 * per-entry overhead at that scale), while a Fenwick tree mirrors the same
 * values to answer "offset of row i" and "total content height" in
 * O(log n) instead of O(n).
 *
 * Estimates start at `initialEstimate` for every index and get refined via
 * an exponential moving average as real rows are measured, so a handful of
 * measured rows near the viewport smooth out jitter instead of snapping the
 * scrollbar around on every remeasure.
 */
export class RowHeightEstimator {
  private heights: Float64Array;
  private measured: Uint8Array; // 1 = has been measured at least once
  private tree: FenwickTree;
  private readonly alpha: number;
  private readonly initialEstimate: number;

  constructor(
    totalCount: number,
    initialEstimate: number = 64,
    alpha: number = DEFAULT_ALPHA
  ) {
    this.heights = new Float64Array(totalCount).fill(initialEstimate);
    this.measured = new Uint8Array(totalCount);
    this.tree = FenwickTree.filled(totalCount, initialEstimate);
    this.alpha = alpha;
    this.initialEstimate = initialEstimate;
  }

  get size(): number {
    return this.heights.length;
  }

  /**
   * Grows the backing structures to fit a larger list (e.g. after loading
   * more pages forward), preserving all existing estimates. New trailing
   * indices start at the initial estimate. O(n log n) — call once per page
   * load, not per frame.
   */
  resize(newTotalCount: number): void {
    if (newTotalCount <= this.heights.length) return;

    const nextHeights = new Float64Array(newTotalCount).fill(this.initialEstimate);
    nextHeights.set(this.heights);

    const nextMeasured = new Uint8Array(newTotalCount);
    nextMeasured.set(this.measured);

    this.tree = this.tree.grow(newTotalCount, this.initialEstimate, (i) => this.heights[i]);
    this.heights = nextHeights;
    this.measured = nextMeasured;
  }

  /**
   * Shifts every existing estimate `count` slots to the right and fills the
   * newly opened leading slots with the initial estimate, so estimate
   * index `i` keeps referring to the same certificate after a backward
   * (prepend) load. O(n log n) — call once per prepend, not per frame.
   */
  prepend(count: number): void {
    if (count <= 0) return;

    const newSize = this.heights.length + count;
    const nextHeights = new Float64Array(newSize).fill(this.initialEstimate);
    nextHeights.set(this.heights, count);

    const nextMeasured = new Uint8Array(newSize);
    nextMeasured.set(this.measured, count);

    const nextTree = new FenwickTree(newSize);
    for (let i = 0; i < newSize; i++) nextTree.add(i, nextHeights[i]);

    this.heights = nextHeights;
    this.measured = nextMeasured;
    this.tree = nextTree;
  }

  getEstimate(index: number): number {
    if (index < 0 || index >= this.heights.length) return this.initialEstimate;
    return this.heights[index];
  }

  hasMeasured(index: number): boolean {
    return index >= 0 && index < this.measured.length && this.measured[index] === 1;
  }

  /**
   * Records a real measurement for `index`, blended with the prior estimate
   * via EMA (alpha=0.3 by default) rather than overwritten outright — a
   * single unusually tall/short render (e.g. a row mid-transition) shouldn't
   * cause the whole list to jump. O(log n) thanks to the Fenwick tree.
   */
  applyMeasurement(index: number, measuredHeight: number): void {
    if (index < 0 || index >= this.heights.length) return;

    const clamped = clamp(measuredHeight, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT);
    const prev = this.heights[index];

    const next = this.measured[index]
      ? this.alpha * clamped + (1 - this.alpha) * prev
      : clamped; // first real measurement: trust it outright

    this.tree.add(index, next - prev);
    this.heights[index] = next;
    this.measured[index] = 1;
  }

  /** Offset of `index` from the top of the list — O(log n). */
  offsetOf(index: number): number {
    return this.tree.prefixSum(index);
  }

  /** Total content height across every tracked row — O(log n). */
  totalHeight(): number {
    return this.tree.total();
  }

  /**
   * Binary-searches for the row index whose span contains `offset` (e.g.
   * the current scrollTop). O(log n) via the tree's implicit prefix-sum
   * ordering — this is the operation that makes "compute visible range
   * from scrollTop" cheap enough to run every scroll frame at 100k rows.
   */
  indexAtOffset(offset: number): number {
    if (offset <= 0) return 0;
    if (offset >= this.totalHeight()) return Math.max(0, this.heights.length - 1);

    let lo = 0;
    let hi = this.heights.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const midOffset = this.tree.prefixSum(mid + 1);
      if (midOffset <= offset) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }
}

/**
 * Measures a mounted row element's real height via getBoundingClientRect
 * (not offsetHeight, which loses the sub-pixel precision getBoundingClientRect
 * captures) and feeds it back into the estimator. Meant to be called from a
 * ResizeObserver or a ref callback on mount/resize.
 */
export function measureAndApply(
  estimator: RowHeightEstimator,
  index: number,
  element: Element
): void {
  const rect = element.getBoundingClientRect();
  if (rect.height > 0) {
    estimator.applyMeasurement(index, rect.height);
  }
}
