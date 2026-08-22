// src/components/farm/DataTable.tsx
"use client";

import { useMemo, useRef, useState } from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useFarmData } from "@/src/hooks/useFarmData";
import { useFarmRole } from "@/src/hooks/useFarmRole";
import {
  ROLE_COLUMN_ACCESS,
  type FarmRow,
  type FilterGroup,
  type SortState,
} from "@/src/types/farm";

const COLUMN_LABELS: Record<keyof FarmRow, string> = {
  id: "ID",
  fieldName: "Field name",
  crop: "Crop",
  plantingDate: "Planting date",
  expectedYield: "Expected yield",
  actualYield: "Actual yield",
  inputCosts: "Input costs",
  revenue: "Revenue",
};

const ROW_HEIGHT_PX = 40;

interface DataTableProps {
  farmId: string;
}

export function DataTable({ farmId }: DataTableProps) {
  const { role, isLoading: roleLoading } = useFarmRole(farmId);
  const [page, setPage] = useState(0);
  const [sorting, setSorting] = useState<SortState[]>([]);
  const [filterGroup] = useState<FilterGroup>({
    operator: "AND",
    filters: [],
  });

  const { data, isLoading, error } = useFarmData({
    farmId,
    page,
    sorting,
    filterGroup,
  });

  const visibleColumns = useMemo<(keyof FarmRow)[]>(() => {
    if (!role) return [];
    return ROLE_COLUMN_ACCESS[role];
  }, [role]);

  const columns = useMemo<ColumnDef<FarmRow>[]>(
    () =>
      visibleColumns.map((key) => ({
        accessorKey: key,
        header: COLUMN_LABELS[key],
        cell: (info) => {
          const value = info.getValue();
          return value == null ? "—" : String(value);
        },
      })),
    [visibleColumns]
  );

  const rows = data?.rows ?? [];

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
  });

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const tableRows = table.getRowModel().rows;

  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 10,
  });

  function toggleSort(columnId: keyof FarmRow) {
    setSorting((prev) => {
      const existing = prev.find((s) => s.id === columnId);
      if (!existing) return [{ id: columnId, desc: false }];
      if (!existing.desc) return [{ id: columnId, desc: true }];
      return [];
    });
    setPage(0);
  }

  if (roleLoading) {
    return <div className="p-4 text-sm text-zinc-500">Resolving your access…</div>;
  }

  if (!role) {
    return (
      <div className="p-4 text-sm text-red-600">
        Could not determine your role for this farm.
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-sm text-red-600">Error: {error}</div>;
  }

  const totalCount = data?.totalCount ?? 0;
  const pageSize = data?.pageSize ?? 100;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={tableContainerRef}
        className="relative max-h-[600px] overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800"
      >
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-100 dark:bg-zinc-900">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const columnId = header.column.id as keyof FarmRow;
                  const sortState = sorting.find((s) => s.id === columnId);
                  return (
                    <th
                      key={header.id}
                      className="cursor-pointer select-none border-b border-zinc-200 px-3 py-2 text-left font-medium dark:border-zinc-800"
                      onClick={() => toggleSort(columnId)}
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
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="p-4 text-center text-zinc-500">
                  Loading…
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

      <div className="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-400">
        <span>
          Page {page + 1} of {totalPages} · {totalCount.toLocaleString()} rows
        </span>
        <div className="flex gap-2">
          <button
            className="rounded border border-zinc-300 px-3 py-1 disabled:opacity-40 dark:border-zinc-700"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            Previous
          </button>
          <button
            className="rounded border border-zinc-300 px-3 py-1 disabled:opacity-40 dark:border-zinc-700"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page + 1 >= totalPages}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
