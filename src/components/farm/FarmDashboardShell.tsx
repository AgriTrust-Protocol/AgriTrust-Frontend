"use client";

import { useState } from "react";
import { DataTable } from "@/src/components/farm/DataTable";
import { ReportBuilder } from "@/src/components/farm/ReportBuilder";
import { ScheduledReportConfig } from "@/src/components/farm/ScheduledReportConfig";
import type { FarmDataQueryState, FarmDataRow, FarmRole } from "@/src/hooks/useFarmData";

const defaultQueryState: FarmDataQueryState = {
  pageIndex: 0,
  pageSize: 100,
  filters: [],
  filterCombinator: "AND",
  sorting: [],
  visibleColumns: ["fieldName", "crop", "plantingDate", "expectedYield", "actualYield", "inputCosts", "revenue"],
};

export function FarmDashboardShell({ farmId, role, rows }: { farmId: string; role: FarmRole; rows: FarmDataRow[] }) {
  const [reportState, setReportState] = useState<FarmDataQueryState>(defaultQueryState);

  return (
    <div className="space-y-6">
      <DataTable farmId={farmId} role={role} initialRows={rows} />
      <ReportBuilder farmId={farmId} queryState={reportState} onChange={setReportState} />
      <ScheduledReportConfig farmId={farmId} />
    </div>
  );
}
