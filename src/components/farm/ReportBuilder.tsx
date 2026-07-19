"use client";

import { useState } from "react";
import { FARM_COLUMNS, type FarmDataQueryState, type FarmFilter, type FilterCombinator } from "@/src/hooks/useFarmData";

interface ReportBuilderProps {
  farmId: string;
  queryState: FarmDataQueryState;
  onChange: (state: FarmDataQueryState) => void;
}

export function ReportBuilder({ farmId, queryState, onChange }: ReportBuilderProps) {
  const [name, setName] = useState("Monthly farm report");
  const addFilter = () => onChange({ ...queryState, filters: [...queryState.filters, { id: crypto.randomUUID(), column: "fieldName", operator: "contains", value: "" }] });

  async function saveReport() {
    await fetch(`/api/farms/${farmId}/reports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, queryState }) });
  }

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Custom report builder</h2>
        <input value={name} onChange={(event) => setName(event.target.value)} className="rounded-lg border px-3 py-2" aria-label="Report name" />
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {FARM_COLUMNS.map((column) => <label key={column.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm"><input type="checkbox" checked={queryState.visibleColumns.includes(column.id)} onChange={(event) => onChange({ ...queryState, visibleColumns: event.target.checked ? [...queryState.visibleColumns, column.id] : queryState.visibleColumns.filter((item) => item !== column.id) })} />{column.label}</label>)}
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Filters</span>
          <select value={queryState.filterCombinator} onChange={(event) => onChange({ ...queryState, filterCombinator: event.target.value as FilterCombinator })} className="rounded border px-2 py-1"><option>AND</option><option>OR</option></select>
          <button type="button" onClick={addFilter} className="rounded bg-zinc-900 px-3 py-1 text-sm text-white">Add condition</button>
        </div>
        {queryState.filters.map((filter) => <FilterRow key={filter.id} filter={filter} onChange={(next) => onChange({ ...queryState, filters: queryState.filters.map((item) => item.id === filter.id ? next : item) })} onRemove={() => onChange({ ...queryState, filters: queryState.filters.filter((item) => item.id !== filter.id) })} />)}
      </div>
      <button type="button" onClick={saveReport} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white">Save report configuration</button>
    </section>
  );
}

function FilterRow({ filter, onChange, onRemove }: { filter: FarmFilter; onChange: (filter: FarmFilter) => void; onRemove: () => void }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 p-2"><select value={filter.column} onChange={(event) => onChange({ ...filter, column: event.target.value as FarmFilter["column"] })} className="rounded border px-2 py-1">{FARM_COLUMNS.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}</select><select value={filter.operator} onChange={(event) => onChange({ ...filter, operator: event.target.value as FarmFilter["operator"] })} className="rounded border px-2 py-1"><option value="contains">contains</option><option value="equals">equals</option><option value="between">between</option><option value="gte">≥</option><option value="lte">≤</option></select><input value={filter.value} onChange={(event) => onChange({ ...filter, value: event.target.value })} className="rounded border px-2 py-1" placeholder="Value" />{filter.operator === "between" && <input value={filter.valueTo ?? ""} onChange={(event) => onChange({ ...filter, valueTo: event.target.value })} className="rounded border px-2 py-1" placeholder="To" />}<button type="button" onClick={onRemove} className="text-sm font-semibold text-red-700">Remove</button></div>;
}
