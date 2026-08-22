// src/components/farm/ExportButton.tsx
"use client";

import { useState } from "react";
import { exportFarmData } from "@/src/utils/exportService";
import type { ExportFormat, FarmRole, FilterGroup } from "@/src/types/farm";

interface ExportButtonProps {
  farmId: string;
  role: FarmRole;
  filterGroup: FilterGroup;
  page: number;
  pageSize: number;
}

export function ExportButton({
  farmId,
  role,
  filterGroup,
  page,
  pageSize,
}: ExportButtonProps) {
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setIsExporting(true);
    setError(null);
    try {
      await exportFarmData({ farmId, format, role, filterGroup, page, pageSize });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={format}
        onChange={(e) => setFormat(e.target.value as ExportFormat)}
        className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      >
        <option value="csv">CSV (full dataset)</option>
        <option value="pdf">PDF (current view)</option>
      </select>
      <button
        onClick={handleExport}
        disabled={isExporting}
        className="rounded border border-zinc-300 px-3 py-1 text-sm disabled:opacity-50 dark:border-zinc-700"
      >
        {isExporting ? "Exporting…" : "Export"}
      </button>
      {error ? <span className="text-sm text-red-600">{error}</span> : null}
    </div>
  );
}
