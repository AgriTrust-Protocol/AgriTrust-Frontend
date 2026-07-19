"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

export type FarmRole = "FarmOperator" | "Agronomist" | "Accountant" | "Viewer";
export type ExportFormat = "csv" | "pdf";
export type ReportFrequency = "daily" | "weekly" | "monthly";
export type FilterOperator = "contains" | "equals" | "between" | "gte" | "lte";
export type FilterCombinator = "AND" | "OR";

export interface FarmDataRow {
  id: string;
  fieldName: string;
  crop: string;
  plantingDate: string;
  expectedYield: number;
  actualYield: number;
  inputCosts: number;
  revenue: number;
}

export interface FarmColumn {
  id: keyof FarmDataRow;
  label: string;
  type: "text" | "date" | "number" | "currency";
  roles: FarmRole[];
}

export interface FarmFilter {
  id: string;
  column: keyof FarmDataRow;
  operator: FilterOperator;
  value: string;
  valueTo?: string;
}

export interface FarmSorting {
  column: keyof FarmDataRow;
  direction: "asc" | "desc";
}

export interface FarmDataQueryState {
  pageIndex: number;
  pageSize: number;
  filters: FarmFilter[];
  filterCombinator: FilterCombinator;
  sorting: FarmSorting[];
  visibleColumns: Array<keyof FarmDataRow>;
}

export interface FarmDataResponse {
  rows: FarmDataRow[];
  totalRows: number;
  pageCount: number;
  filteredRows: number;
}

export const FARM_COLUMNS: FarmColumn[] = [
  { id: "fieldName", label: "Field name", type: "text", roles: ["FarmOperator", "Agronomist", "Viewer"] },
  { id: "crop", label: "Crop", type: "text", roles: ["FarmOperator", "Agronomist", "Viewer"] },
  { id: "plantingDate", label: "Planting date", type: "date", roles: ["FarmOperator", "Agronomist", "Viewer"] },
  { id: "expectedYield", label: "Expected yield", type: "number", roles: ["FarmOperator", "Agronomist", "Viewer"] },
  { id: "actualYield", label: "Actual yield", type: "number", roles: ["FarmOperator", "Agronomist", "Viewer"] },
  { id: "inputCosts", label: "Input costs", type: "currency", roles: ["FarmOperator", "Accountant"] },
  { id: "revenue", label: "Revenue", type: "currency", roles: ["FarmOperator", "Accountant"] },
];

export function columnsForRole(role: FarmRole) {
  return FARM_COLUMNS.filter((column) => column.roles.includes(role));
}

export function defaultColumnsForRole(role: FarmRole) {
  return columnsForRole(role).map((column) => column.id);
}

const normalize = (value: unknown) => String(value ?? "").toLowerCase();

function rowMatchesFilter(row: FarmDataRow, filter: FarmFilter) {
  const raw = row[filter.column];
  const value = filter.value.trim();
  if (!value) return true;

  if (filter.operator === "contains") return normalize(raw).includes(value.toLowerCase());
  if (filter.operator === "equals") return normalize(raw) === value.toLowerCase();
  if (filter.operator === "between") return String(raw) >= value && (!filter.valueTo || String(raw) <= filter.valueTo);
  if (filter.operator === "gte") return Number(raw) >= Number(value);
  if (filter.operator === "lte") return Number(raw) <= Number(value);
  return true;
}

export function applyFarmQuery(data: FarmDataRow[], state: FarmDataQueryState): FarmDataResponse {
  const filtered = state.filters.length === 0
    ? data
    : data.filter((row) => state.filterCombinator === "AND"
      ? state.filters.every((filter) => rowMatchesFilter(row, filter))
      : state.filters.some((filter) => rowMatchesFilter(row, filter)));

  const sorted = [...filtered].sort((a, b) => {
    for (const sort of state.sorting) {
      const left = a[sort.column];
      const right = b[sort.column];
      const comparison = typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right));
      if (comparison !== 0) return sort.direction === "asc" ? comparison : -comparison;
    }
    return 0;
  });

  const start = state.pageIndex * state.pageSize;
  const rows = sorted.slice(start, start + state.pageSize);
  return { rows, totalRows: data.length, filteredRows: filtered.length, pageCount: Math.max(1, Math.ceil(filtered.length / state.pageSize)) };
}

export function buildFarmDataQuery(state: FarmDataQueryState) {
  const params = new URLSearchParams({
    page: String(state.pageIndex + 1),
    pageSize: String(state.pageSize),
    filters: JSON.stringify({ combinator: state.filterCombinator, conditions: state.filters }),
    sort: JSON.stringify(state.sorting),
    columns: state.visibleColumns.join(","),
  });
  return params.toString();
}

async function fetchFarmData(farmId: string, state: FarmDataQueryState): Promise<FarmDataResponse> {
  const response = await fetch(`/api/farms/${farmId}/data?${buildFarmDataQuery(state)}`);
  if (!response.ok) throw new Error("Unable to load farm data");
  return response.json();
}

export function useFarmData(farmId: string, initialRole: FarmRole, initialRows?: FarmDataRow[]) {
  const [role, setRole] = useState<FarmRole>(initialRole);
  const [queryState, setQueryState] = useState<FarmDataQueryState>({
    pageIndex: 0,
    pageSize: 100,
    filters: [],
    filterCombinator: "AND",
    sorting: [],
    visibleColumns: defaultColumnsForRole(initialRole),
  });

  const localData = useMemo(() => initialRows ? applyFarmQuery(initialRows, queryState) : undefined, [initialRows, queryState]);
  const remoteData = useQuery({
    queryKey: ["farm-data", farmId, queryState],
    queryFn: () => fetchFarmData(farmId, queryState),
    enabled: !initialRows,
    staleTime: 30_000,
  });

  return {
    role,
    setRole: (nextRole: FarmRole) => {
      setRole(nextRole);
      setQueryState((current) => ({ ...current, pageIndex: 0, visibleColumns: defaultColumnsForRole(nextRole) }));
    },
    queryState,
    setQueryState,
    data: localData ?? remoteData.data ?? { rows: [], totalRows: 0, filteredRows: 0, pageCount: 1 },
    isLoading: !initialRows && remoteData.isLoading,
    error: remoteData.error,
  };
}
