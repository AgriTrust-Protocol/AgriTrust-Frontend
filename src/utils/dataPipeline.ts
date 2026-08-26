/**
 * dataPipeline.ts
 *
 * Pure, synchronous data-processing primitives shared between the main thread
 * and the analyticsDataProcessor Web Worker.  The functions here are designed
 * to be fast enough for the Worker use-case (< 500 ms on 100 K records) while
 * remaining testable in a plain Node / jsdom environment.
 *
 * All operations are written against the generic `AnalyticsRecord` interface so
 * they can handle FarmRow data as well as any future record shape.
 */

import type { SortState, FilterGroup, ColumnFilter, FarmRow } from "@/src/types/farm";

// ─── Public record type ────────────────────────────────────────────────────

/** An analytics record is a plain object with arbitrary string keys. */
export type AnalyticsRecord = Record<string, unknown>;

// ─── Sort ─────────────────────────────────────────────────────────────────

/**
 * Multi-column sort of `rows` in-place, returning the same array.
 *
 * Uses a single pass comparator over the ordered `states` array so the
 * sort engine only invokes one comparison function per pair.
 *
 * Numeric columns are compared with `<` / `>`, everything else falls back to
 * `localeCompare` (or lexicographic comparison for non-strings).
 */
export function sortRows<T extends AnalyticsRecord>(
  rows: T[],
  states: SortState[]
): T[] {
  if (states.length === 0) return rows;

  rows.sort((a, b) => {
    for (const { id, desc } of states) {
      const av = a[id as string];
      const bv = b[id as string];

      let cmp = 0;

      if (av == null && bv == null) cmp = 0;
      else if (av == null) cmp = -1;
      else if (bv == null) cmp = 1;
      else if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        const as = String(av);
        const bs = String(bv);
        cmp = as.localeCompare(bs, undefined, { numeric: true, sensitivity: "base" });
      }

      if (cmp !== 0) return desc ? -cmp : cmp;
    }
    return 0;
  });

  return rows;
}

// ─── Filter ───────────────────────────────────────────────────────────────

/**
 * Apply a `FilterGroup` to `rows`, returning only the rows that satisfy the
 * group.  Performs a single linear scan; the early-exit logic inside
 * `testRow` avoids checking remaining filters once the result is determined.
 */
export function filterRows<T extends AnalyticsRecord>(
  rows: T[],
  group: FilterGroup
): T[] {
  if (group.filters.length === 0) return rows;

  return rows.filter((row) => testRow(row, group));
}

function testRow<T extends AnalyticsRecord>(row: T, group: FilterGroup): boolean {
  const isAnd = group.operator === "AND";
  for (const filter of group.filters) {
    const pass = testFilter(row, filter as ColumnFilter);
    if (isAnd && !pass) return false;
    if (!isAnd && pass) return true;
  }
  // All passed (AND) or none passed (OR)
  return isAnd;
}

function testFilter<T extends AnalyticsRecord>(row: T, filter: ColumnFilter): boolean {
  const raw = row[filter.columnId as string];

  switch (filter.type) {
    case "text": {
      if (typeof filter.value !== "string") return true;
      return String(raw ?? "")
        .toLowerCase()
        .includes(filter.value.toLowerCase());
    }
    case "select": {
      if (typeof filter.value !== "string") return true;
      return String(raw ?? "") === filter.value;
    }
    case "dateRange": {
      if (!Array.isArray(filter.value) || filter.value.length < 2) return true;
      const [from, to] = filter.value as [string, string];
      const date = String(raw ?? "");
      return date >= from && date <= to;
    }
    default:
      return true;
  }
}

// ─── Aggregate ────────────────────────────────────────────────────────────

export type AggregateOperation = "SUM" | "AVG" | "COUNT" | "MIN" | "MAX";
export type TimeBucket = "day" | "week" | "month" | "quarter";

export interface AggregateOptions {
  /** The numeric field to aggregate */
  field: keyof FarmRow;
  /** The date field to use for bucketing (must be an ISO date string) */
  dateField: keyof FarmRow;
  /** How to bucket dates */
  bucketSize: TimeBucket;
  /** The aggregation operation */
  operation: AggregateOperation;
}

export interface AggregateResult {
  bucket: string;
  value: number;
  count: number;
}

/**
 * Aggregate `rows` by a time bucket.
 *
 * The implementation uses a single-pass accumulation into a `Map<string, …>`
 * which is O(n) and avoids sorting until the final step.
 *
 * @returns Results sorted chronologically by bucket key.
 */
export function aggregateRows<T extends AnalyticsRecord>(
  rows: T[],
  options: AggregateOptions
): AggregateResult[] {
  type Acc = { sum: number; min: number; max: number; count: number };
  const buckets = new Map<string, Acc>();

  for (const row of rows) {
    const rawDate = row[options.dateField as string];
    if (rawDate == null) continue;

    const bucket = toBucketKey(String(rawDate), options.bucketSize);

    const rawValue = row[options.field as string];
    const value = typeof rawValue === "number" ? rawValue : parseFloat(String(rawValue ?? "0"));
    if (Number.isNaN(value)) continue;

    const existing = buckets.get(bucket);
    if (existing) {
      existing.sum += value;
      existing.count += 1;
      if (value < existing.min) existing.min = value;
      if (value > existing.max) existing.max = value;
    } else {
      buckets.set(bucket, { sum: value, min: value, max: value, count: 1 });
    }
  }

  const results: AggregateResult[] = [];
  for (const [bucket, acc] of buckets) {
    let value: number;
    switch (options.operation) {
      case "SUM":   value = acc.sum;           break;
      case "AVG":   value = acc.sum / acc.count; break;
      case "COUNT": value = acc.count;         break;
      case "MIN":   value = acc.min;           break;
      case "MAX":   value = acc.max;           break;
      default:      value = acc.sum;
    }
    results.push({ bucket, value, count: acc.count });
  }

  // Sort chronologically — bucket keys are formatted as YYYY-* which sort lexicographically
  results.sort((a, b) => a.bucket.localeCompare(b.bucket));
  return results;
}

// ─── Bucket key helpers ───────────────────────────────────────────────────

/**
 * Convert an ISO date string (YYYY-MM-DD or full ISO-8601) to a stable bucket
 * key for the given `TimeBucket` granularity.
 */
function toBucketKey(dateStr: string, bucket: TimeBucket): string {
  // Truncate to date portion to avoid TZ issues with `new Date()`
  const datePart = dateStr.slice(0, 10); // YYYY-MM-DD
  const [year, month, day] = datePart.split("-").map(Number);

  switch (bucket) {
    case "day":
      return datePart;

    case "week": {
      // ISO week: Monday-aligned
      const d = new Date(year, month - 1, day);
      const dow = d.getDay(); // 0 = Sun
      const diff = (dow === 0 ? -6 : 1) - dow; // offset to Monday
      const monday = new Date(d);
      monday.setDate(d.getDate() + diff);
      return monday.toISOString().slice(0, 10);
    }

    case "month":
      return `${year}-${String(month).padStart(2, "0")}`;

    case "quarter": {
      const q = Math.ceil(month / 3);
      return `${year}-Q${q}`;
    }

    default:
      return datePart;
  }
}
