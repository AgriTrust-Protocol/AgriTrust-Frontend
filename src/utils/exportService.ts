import type { ExportFormat, FarmDataQueryState } from "@/src/hooks/useFarmData";

export interface ExportRequest {
  farmId: string;
  format: ExportFormat;
  queryState: FarmDataQueryState;
  currentViewOnly?: boolean;
}

export function buildExportUrl({ farmId, format, queryState, currentViewOnly = format === "pdf" }: ExportRequest) {
  const params = new URLSearchParams({
    format,
    filters: JSON.stringify({ combinator: queryState.filterCombinator, conditions: queryState.filters }),
    sort: JSON.stringify(queryState.sorting),
    columns: queryState.visibleColumns.join(","),
    scope: currentViewOnly ? "current-view" : "full-dataset",
  });

  if (currentViewOnly) {
    params.set("page", String(queryState.pageIndex + 1));
    params.set("pageSize", String(queryState.pageSize));
  }

  return `/api/farms/${farmId}/export?${params.toString()}`;
}

export async function requestFarmExport(request: ExportRequest) {
  const response = await fetch(buildExportUrl(request), { method: "GET" });
  if (!response.ok) throw new Error("Unable to export farm report");
  return response.blob();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
