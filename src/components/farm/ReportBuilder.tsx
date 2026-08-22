// src/components/farm/ReportBuilder.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ColumnFilter,
  FarmRole,
  FarmRow,
  FilterGroup,
  FilterOperator,
  ReportConfig,
  SortState,
} from "@/src/types/farm";
import { ROLE_COLUMN_ACCESS } from "@/src/types/farm";

const STORAGE_KEY = "agritrust:reportConfigs";

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

const FILTERABLE_COLUMNS: (keyof FarmRow)[] = [
  "fieldName",
  "crop",
  "plantingDate",
  "expectedYield",
  "actualYield",
  "inputCosts",
  "revenue",
];

function loadConfigs(): ReportConfig[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ReportConfig[]) : [];
  } catch {
    return [];
  }
}

function saveConfigs(configs: ReportConfig[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
}

function newFilter(columnId: keyof FarmRow): ColumnFilter {
  return {
    id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    columnId,
    type: "text",
    value: "",
  };
}

interface ReportBuilderProps {
  role: FarmRole;
  onApply?: (config: {
    columns: (keyof FarmRow)[];
    filterGroup: FilterGroup;
    sorting: SortState[];
  }) => void;
}

export default function ReportBuilder({ role, onApply }: ReportBuilderProps) {
  const availableColumns = ROLE_COLUMN_ACCESS[role];

  const [selectedColumns, setSelectedColumns] = useState<(keyof FarmRow)[]>(availableColumns);
  const [operator, setOperator] = useState<FilterOperator>("AND");
  const [filters, setFilters] = useState<ColumnFilter[]>([]);
  const [sorting, setSorting] = useState<SortState[]>([]);
  const [configs, setConfigs] = useState<ReportConfig[]>([]);
  const [configName, setConfigName] = useState("");
  const [selectedConfigId, setSelectedConfigId] = useState<string>("");

  useEffect(() => {
    setConfigs(loadConfigs());
  }, []);

  useEffect(() => {
    // Role changed: drop any selected column the new role can't see.
    setSelectedColumns((prev) => prev.filter((c) => availableColumns.includes(c)));
  }, [availableColumns]);

  const filterableForRole = useMemo(
    () => FILTERABLE_COLUMNS.filter((c) => availableColumns.includes(c)),
    [availableColumns]
  );

  function toggleColumn(col: keyof FarmRow) {
    setSelectedColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  }

  function addFilter() {
    if (filterableForRole.length === 0) return;
    setFilters((prev) => [...prev, newFilter(filterableForRole[0])]);
  }

  function updateFilter(id: string, patch: Partial<ColumnFilter>) {
    setFilters((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function removeFilter(id: string) {
    setFilters((prev) => prev.filter((f) => f.id !== id));
  }

  function toggleSort(col: keyof FarmRow) {
    setSorting((prev) => {
      const existing = prev.find((s) => s.id === col);
      if (!existing) return [...prev, { id: col, desc: false }];
      if (!existing.desc) return prev.map((s) => (s.id === col ? { ...s, desc: true } : s));
      return prev.filter((s) => s.id !== col);
    });
  }

  function currentFilterGroup(): FilterGroup {
    return { operator, filters };
  }

  function handleApply() {
    onApply?.({ columns: selectedColumns, filterGroup: currentFilterGroup(), sorting });
  }

  function handleSave() {
    const name = configName.trim();
    if (!name) return;
    const config: ReportConfig = {
      id: `rc_${Date.now()}`,
      name,
      columns: selectedColumns,
      filterGroup: currentFilterGroup(),
      sorting,
      createdAt: new Date().toISOString(),
    };
    const next = [...configs, config];
    setConfigs(next);
    saveConfigs(next);
    setConfigName("");
    setSelectedConfigId(config.id);
  }

  function handleLoad(id: string) {
    setSelectedConfigId(id);
    const config = configs.find((c) => c.id === id);
    if (!config) return;
    setSelectedColumns(config.columns.filter((c) => availableColumns.includes(c)));
    setOperator(config.filterGroup.operator);
    setFilters(config.filterGroup.filters);
    setSorting(config.sorting);
  }

  function handleDelete(id: string) {
    const next = configs.filter((c) => c.id !== id);
    setConfigs(next);
    saveConfigs(next);
    if (selectedConfigId === id) setSelectedConfigId("");
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4 space-y-6" data-testid="report-builder">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Columns</h3>
        <div className="flex flex-wrap gap-3">
          {availableColumns.map((col) => (
            <label key={col} className="flex items-center gap-1.5 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={selectedColumns.includes(col)}
                onChange={() => toggleColumn(col)}
              />
              {COLUMN_LABELS[col]}
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900">Filters</h3>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Match</label>
            <select
              value={operator}
              onChange={(e) => setOperator(e.target.value as FilterOperator)}
              className="text-xs border border-gray-300 rounded px-1.5 py-0.5"
            >
              <option value="AND">ALL (AND)</option>
              <option value="OR">ANY (OR)</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          {filters.map((filter) => (
            <div key={filter.id} className="flex items-center gap-2">
              <select
                value={filter.columnId}
                onChange={(e) =>
                  updateFilter(filter.id, { columnId: e.target.value as keyof FarmRow, value: "" })
                }
                className="text-sm border border-gray-300 rounded px-1.5 py-1"
              >
                {filterableForRole.map((col) => (
                  <option key={col} value={col}>
                    {COLUMN_LABELS[col]}
                  </option>
                ))}
              </select>

              <select
                value={filter.type}
                onChange={(e) =>
                  updateFilter(filter.id, {
                    type: e.target.value as ColumnFilter["type"],
                    value: e.target.value === "dateRange" ? ["", ""] : "",
                  })
                }
                className="text-sm border border-gray-300 rounded px-1.5 py-1"
              >
                <option value="text">contains</option>
                <option value="select">equals</option>
                <option value="dateRange">date range</option>
              </select>

              {filter.type === "dateRange" ? (
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={Array.isArray(filter.value) ? filter.value[0] : ""}
                    onChange={(e) =>
                      updateFilter(filter.id, {
                        value: [e.target.value, Array.isArray(filter.value) ? filter.value[1] : ""],
                      })
                    }
                    className="text-sm border border-gray-300 rounded px-1.5 py-1"
                  />
                  <span className="text-xs text-gray-400">to</span>
                  <input
                    type="date"
                    value={Array.isArray(filter.value) ? filter.value[1] : ""}
                    onChange={(e) =>
                      updateFilter(filter.id, {
                        value: [Array.isArray(filter.value) ? filter.value[0] : "", e.target.value],
                      })
                    }
                    className="text-sm border border-gray-300 rounded px-1.5 py-1"
                  />
                </div>
              ) : (
                <input
                  type="text"
                  value={typeof filter.value === "string" ? filter.value : ""}
                  onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                  placeholder="value"
                  className="text-sm border border-gray-300 rounded px-1.5 py-1 flex-1"
                />
              )}

              <button
                type="button"
                onClick={() => removeFilter(filter.id)}
                className="text-xs text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addFilter}
          className="mt-2 text-xs text-blue-600 hover:underline"
        >
          + Add filter
        </button>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Sort</h3>
        <div className="flex flex-wrap gap-2">
          {filterableForRole.map((col) => {
            const sort = sorting.find((s) => s.id === col);
            return (
              <button
                key={col}
                type="button"
                onClick={() => toggleSort(col)}
                className={`text-xs px-2 py-1 rounded border ${
                  sort ? "border-blue-500 text-blue-700 bg-blue-50" : "border-gray-300 text-gray-600"
                }`}
              >
                {COLUMN_LABELS[col]}
                {sort ? (sort.desc ? " ↓" : " ↑") : ""}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <select
            value={selectedConfigId}
            onChange={(e) => handleLoad(e.target.value)}
            className="text-sm border border-gray-300 rounded px-1.5 py-1"
          >
            <option value="">Load saved report…</option>
            {configs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {selectedConfigId && (
            <button
              type="button"
              onClick={() => handleDelete(selectedConfigId)}
              className="text-xs text-red-600 hover:underline"
            >
              Delete
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={configName}
            onChange={(e) => setConfigName(e.target.value)}
            placeholder="Report name"
            className="text-sm border border-gray-300 rounded px-1.5 py-1"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!configName.trim()}
            className="text-sm px-3 py-1 rounded border border-gray-300 disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="text-sm px-3 py-1 rounded bg-blue-600 text-white"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
