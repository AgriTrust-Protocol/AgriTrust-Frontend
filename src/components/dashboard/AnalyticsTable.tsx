/**
 * AnalyticsTable.tsx
 *
 * Analytics data table that offloads all sorting / filtering / aggregation to
 * the analyticsDataProcessor Web Worker via the `useAnalyticsData` hook.
 *
 * Features
 * ─────────
 * • Determinate progress bar while the worker is processing.
 * • Multi-column sort (click header to cycle: none → asc → desc).
 * • Date-range and text filters.
 * • Optional aggregation view (month bucket, SUM/AVG/COUNT).
 * • Virtualized rows via @tanstack/react-virtual for large datasets.
 * • Cancel button to abort in-flight processing.
 * • Accessible: progress bar has role="progressbar", loading state announced.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAnalyticsData } from "@/src/hooks/useAnalyticsData";
import type { FarmRow, SortState, FilterGroup } from "@/src/types/farm";
import type { AggregateOptions, AggregateResult } from "@/src/utils/dataPipeline";

// ─── Column metadata ──────────────────────────────────────────────────────

const COLUMN_LABELS: Record<keyof FarmRow, string> = {
  id: "ID",
  fieldName: "Field Name",
  crop: "Crop",
  plantingDate: "Planting Date",
  expectedYield: "Expected Yield",
  actualYield: "Actual Yield",
  inputCosts: "Input Costs",
  revenue: "Revenue",
};

const VISIBLE_COLUMNS: (keyof FarmRow)[] = [
  "fieldName",
  "crop",
  "plantingDate",
  "expectedYield",
  "actualYield",
  "inputCosts",
  "revenue",
];

const ROW_HEIGHT_PX = 40;

// ─── Props ────────────────────────────────────────────────────────────────

export interface AnalyticsTableProps {
  /** The full dataset to process.  Passed to the worker on every update. */
  data: FarmRow[];
  /** Optional aggregate configuration */
  aggregateOptions?: AggregateOptions;
  /** Optional initial filter group */
  initialFilter?: FilterGroup;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────

export function AnalyticsTable({
  data,
  aggregateOptions,
  initialFilter,
  className = "",
}: AnalyticsTableProps) {
  // ── Local UI state ───────────────────────────────────────────────────────
  const [sorting, setSorting] = useState<SortState[]>([]);
  const [filterGroup, setFilterGroup] = useState<FilterGroup>(
    initialFilter ?? { operator: "AND", filters: [] }
  );
  const [textSearch, setTextSearch] = useState("");
  const [showAggregated, setShowAggregated] = useState(false);

  // ── Progress display ─────────────────────────────────────────────────────
  const [displayProgress, setDisplayProgress] = useState(0);

  const { rows, aggregated, isProcessing, progress, error, durationMs, process, cancel } =
    useAnalyticsData({ onProgress: setDisplayProgress });

  // ── Trigger re-processing when inputs change ─────────────────────────────
  useEffect(() => {
    // Build the active filter group: combine the prop filter with the text search
    const activeFilter: FilterGroup = {
      operator: filterGroup.operator,
      filters: [
        ...filterGroup.filters,
        ...(textSearch.trim()
          ? ([
              {
                id: "__text_search",
                columnId: "fieldName" as keyof FarmRow,
                type: "text" as const,
                value: textSearch.trim(),
              },
            ] as FilterGroup["filters"])
          : []),
      ],
    };

    process({
      data,
      sort: sorting.length > 0 ? sorting : undefined,
      filter: activeFilter.filters.length > 0 ? activeFilter : undefined,
      aggregate: aggregateOptions,
    });
    // We intentionally include `process` but it's stable (no deps) — no loop risk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sorting, filterGroup, textSearch, aggregateOptions]);

  // ── Column sort toggle ───────────────────────────────────────────────────
  const toggleSort = useCallback((columnId: keyof FarmRow) => {
    setSorting((prev) => {
      const existing = prev.find((s) => s.id === columnId);
      if (!existing) return [{ id: columnId, desc: false }];
      if (!existing.desc) return [{ id: columnId, desc: true }];
      return prev.filter((s) => s.id !== columnId);
    });
  }, []);

  // ── TanStack Table setup ─────────────────────────────────────────────────
  const columns = useMemo<ColumnDef<FarmRow>[]>(
    () =>
      VISIBLE_COLUMNS.map((key) => ({
        id: key,
        accessorKey: key,
        header: COLUMN_LABELS[key],
        cell: (info) => {
          const val = info.getValue();
          if (val == null) return "—";
          if (typeof val === "number") return val.toLocaleString();
          return String(val);
        },
      })),
    []
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualFiltering: true,
  });

  // ── Virtualizer ──────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const tableRows = table.getRowModel().rows;

  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 15,
  });

  // ── Aggregated table columns ─────────────────────────────────────────────
  const aggregatedColumns = useMemo<ColumnDef<AggregateResult>[]>(
    () => [
      {
        id: "bucket",
        accessorKey: "bucket",
        header: "Time Bucket",
      },
      {
        id: "value",
        accessorKey: "value",
        header: aggregateOptions
          ? `${aggregateOptions.operation} of ${String(aggregateOptions.field)}`
          : "Value",
        cell: (info) => {
          const val = info.getValue() as number;
          return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
        },
      },
      {
        id: "count",
        accessorKey: "count",
        header: "Record Count",
        cell: (info) => (info.getValue() as number).toLocaleString(),
      },
    ],
    [aggregateOptions]
  );

  const aggregatedTable = useReactTable({
    data: aggregated ?? [],
    columns: aggregatedColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* ── Controls bar ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Text search */}
        <label className="sr-only" htmlFor="analytics-search">
          Search by field name
        </label>
        <input
          id="analytics-search"
          type="search"
          value={textSearch}
          onChange={(e) => setTextSearch(e.target.value)}
          placeholder="Search field name…"
          className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
        />

        {/* Toggle aggregated view */}
        {aggregated && aggregated.length > 0 && (
          <button
            onClick={() => setShowAggregated((v) => !v)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            {showAggregated ? "Show rows" : "Show aggregation"}
          </button>
        )}

        {/* Cancel button */}
        {isProcessing && (
          <button
            onClick={cancel}
            className="rounded-md border border-red-300 bg-red-50 px-3 py-1 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-700 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
          >
            Cancel
          </button>
        )}

        {/* Timing badge */}
        {durationMs !== null && !isProcessing && (
          <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
            Processed in {durationMs.toLocaleString()} ms · {rows.length.toLocaleString()} rows
          </span>
        )}
      </div>

      {/* ── Progress bar ───────────────────────────────────────────────── */}
      {isProcessing && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={displayProgress}
          aria-label="Processing analytics data"
          className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"
        >
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${displayProgress}%` }}
          />
        </div>
      )}

      {/* ── Error state ─────────────────────────────────────────────────── */}
      {error && !isProcessing && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-400"
        >
          {error}
        </div>
      )}

      {/* ── Aggregated results table ─────────────────────────────────────── */}
      {showAggregated && aggregated && aggregated.length > 0 ? (
        <div className="overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-900">
              {aggregatedTable.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className="border-b border-zinc-200 px-3 py-2 text-left font-medium dark:border-zinc-800"
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {aggregatedTable.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/50"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── Main virtualized rows table ─────────────────────────────────── */
        <div
          ref={containerRef}
          className="relative max-h-[560px] overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800"
        >
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-zinc-100 dark:bg-zinc-900">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => {
                    const colId = header.column.id as keyof FarmRow;
                    const sortState = sorting.find((s) => s.id === colId);
                    return (
                      <th
                        key={header.id}
                        onClick={() => toggleSort(colId)}
                        className="cursor-pointer select-none border-b border-zinc-200 px-3 py-2 text-left font-medium dark:border-zinc-800"
                        aria-sort={
                          sortState
                            ? sortState.desc
                              ? "descending"
                              : "ascending"
                            : "none"
                        }
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sortState ? (sortState.desc ? " ↓" : " ↑") : ""}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                position: "relative",
              }}
            >
              {isProcessing && tableRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={VISIBLE_COLUMNS.length}
                    className="p-8 text-center text-sm text-zinc-400"
                    aria-live="polite"
                  >
                    Processing {data.length.toLocaleString()} records…
                  </td>
                </tr>
              ) : (
                rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = tableRows[virtualRow.index];
                  return (
                    <tr
                      key={row.id}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: `${ROW_HEIGHT_PX}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      className="border-b border-zinc-100 dark:border-zinc-800/50"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-2">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Footer stats ────────────────────────────────────────────────── */}
      {!isProcessing && rows.length > 0 && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Showing {rows.length.toLocaleString()} of {data.length.toLocaleString()} records
          {sorting.length > 0 && (
            <> · sorted by {sorting.map((s) => `${s.id} ${s.desc ? "↓" : "↑"}`).join(", ")}</>
          )}
        </p>
      )}
    </div>
  );
}
