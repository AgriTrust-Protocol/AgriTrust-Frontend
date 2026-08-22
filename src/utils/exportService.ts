// src/utils/exportService.ts
import type { ExportFormat, FarmRole, FilterGroup } from "@/src/types/farm";

interface ExportArgs {
  farmId: string;
  format: ExportFormat;
  role: FarmRole;
  filterGroup: FilterGroup;
  /** Only used for PDF, since it exports the current view/page. */
  page?: number;
  pageSize?: number;
}

/**
 * Calls GET /api/farms/{farmId}/export and triggers a browser download
 * of the returned blob. CSV exports the full filtered dataset; PDF
 * exports the current page only.
 */
export async function exportFarmData({
  farmId,
  format,
  role,
  filterGroup,
  page = 0,
  pageSize = 100,
}: ExportArgs): Promise<void> {
  const params = new URLSearchParams({
    format,
    role,
    filters: JSON.stringify(filterGroup),
  });
  if (format === "pdf") {
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
  }

  const res = await fetch(
    `/api/farms/${encodeURIComponent(farmId)}/export?${params.toString()}`
  );
  if (!res.ok) {
    throw new Error(`Export failed (${res.status})`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = format === "csv" ? "farm-export.csv" : "farm-export.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
