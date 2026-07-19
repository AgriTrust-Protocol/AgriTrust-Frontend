"use client";

import { useMemo } from "react";
import { ExportButton } from "@/src/components/farm/ExportButton";
import { FARM_COLUMNS, columnsForRole, type FarmDataRow, type FarmRole, useFarmData } from "@/src/hooks/useFarmData";

interface DataTableProps {
  farmId: string;
  role: FarmRole;
  initialRows?: FarmDataRow[];
}

const formatCell = (row: FarmDataRow, column: (typeof FARM_COLUMNS)[number]) => {
  const value = row[column.id];
  if (column.type === "currency") return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));
  if (column.type === "number") return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(Number(value));
  return value;
};

export function DataTable({ farmId, role: initialRole, initialRows }: DataTableProps) {
  const { role, setRole, queryState, setQueryState, data, isLoading } = useFarmData(farmId, initialRole, initialRows);
  const allowedColumns = useMemo(() => columnsForRole(role), [role]);
  const visibleColumns = allowedColumns.filter((column) => queryState.visibleColumns.includes(column.id));

  const toggleSort = (column: keyof FarmDataRow) => setQueryState((current) => {
    const existing = current.sorting.find((sort) => sort.column === column);
    const nextDirection = existing?.direction === "asc" ? "desc" : "asc";
    return { ...current, pageIndex: 0, sorting: [{ column, direction: nextDirection }, ...current.sorting.filter((sort) => sort.column !== column)] };
  });

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-zinc-900">Farm management dashboard</h2>
          <p className="text-sm text-zinc-500">Role-filtered view with 100-row server-side pages.</p>
        </div>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Role
          <select value={role} onChange={(event) => setRole(event.target.value as FarmRole)} className="rounded-lg border border-zinc-300 px-3 py-2">
            {(["FarmOperator", "Agronomist", "Accountant", "Viewer"] as FarmRole[]).map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <ExportButton farmId={farmId} queryState={queryState} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {allowedColumns.map((column) => (
          <label key={column.id} className="grid gap-1 text-sm font-medium text-zinc-700">
            {column.label} filter
            <input className="rounded-lg border border-zinc-300 px-3 py-2" placeholder={`Filter ${column.label.toLowerCase()}`} onChange={(event) => setQueryState((current) => ({
              ...current,
              pageIndex: 0,
              filters: [
                ...current.filters.filter((filter) => filter.column !== column.id),
                ...(event.target.value ? [{ id: column.id, column: column.id, operator: column.type === "text" ? "contains" as const : "gte" as const, value: event.target.value }] : []),
              ],
            }))} />
          </label>
        ))}
      </div>

      <div className="overflow-auto rounded-xl border border-zinc-200" style={{ maxHeight: 620 }}>
        <table className="min-w-full divide-y divide-zinc-200 text-sm">
          <thead className="sticky top-0 bg-zinc-50">
            <tr>{visibleColumns.map((column) => <th key={column.id} className="px-4 py-3 text-left font-semibold text-zinc-700"><button type="button" onClick={() => toggleSort(column.id)}>{column.label} ↕</button></th>)}</tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {isLoading ? <tr><td className="px-4 py-6" colSpan={visibleColumns.length}>Loading farm rows…</td></tr> : data.rows.map((row) => (
              <tr key={row.id} className="hover:bg-emerald-50/50">{visibleColumns.map((column) => <td key={column.id} className="whitespace-nowrap px-4 py-3 text-zinc-700">{formatCell(row, column)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-600">
        <span>{data.filteredRows.toLocaleString()} filtered of {data.totalRows.toLocaleString()} rows</span>
        <div className="flex items-center gap-2">
          <button className="rounded border px-3 py-1 disabled:opacity-50" disabled={queryState.pageIndex === 0} onClick={() => setQueryState((current) => ({ ...current, pageIndex: Math.max(0, current.pageIndex - 1) }))}>Previous</button>
          <span>Page {queryState.pageIndex + 1} of {data.pageCount}</span>
          <button className="rounded border px-3 py-1 disabled:opacity-50" disabled={queryState.pageIndex + 1 >= data.pageCount} onClick={() => setQueryState((current) => ({ ...current, pageIndex: current.pageIndex + 1 }))}>Next</button>
        </div>
      </div>
    </section>
  );
}
