"use client";

import { useState } from "react";
import type { ExportFormat, FarmDataQueryState } from "@/src/hooks/useFarmData";
import { downloadBlob, requestFarmExport } from "@/src/utils/exportService";

interface ExportButtonProps {
  farmId: string;
  queryState: FarmDataQueryState;
  reportName?: string;
}

export function ExportButton({ farmId, queryState, reportName = "farm-report" }: ExportButtonProps) {
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    setIsExporting(true);
    try {
      const blob = await requestFarmExport({ farmId, format, queryState, currentViewOnly: format === "pdf" });
      downloadBlob(blob, `${reportName}.${format}`);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex items-end gap-2">
      <label className="grid gap-1 text-sm font-medium text-zinc-700">
        Export format
        <select value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)} className="rounded-lg border border-zinc-300 px-3 py-2">
          <option value="csv">CSV — full dataset</option>
          <option value="pdf">PDF — current view</option>
        </select>
      </label>
      <button type="button" onClick={handleExport} disabled={isExporting} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
        {isExporting ? "Exporting…" : "Export"}
      </button>
    </div>
  );
}
