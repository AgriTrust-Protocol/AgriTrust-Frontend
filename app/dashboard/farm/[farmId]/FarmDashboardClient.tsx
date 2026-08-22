// app/dashboard/farm/[farmId]/FarmDashboardClient.tsx
"use client";

import { useState } from "react";
import { DataTable } from "@/src/components/farm/DataTable";
import { ExportButton } from "@/src/components/farm/ExportButton";
import ReportBuilder from "@/src/components/farm/ReportBuilder";
import ScheduledReportConfig from "@/src/components/farm/ScheduledReportConfig";
import { useFarmRole } from "@/src/hooks/useFarmRole";
import type { FarmRow, FilterGroup, SortState } from "@/src/types/farm";

interface AppliedReport {
  columns: (keyof FarmRow)[];
  filterGroup: FilterGroup;
  sorting: SortState[];
}

const EMPTY_FILTER_GROUP: FilterGroup = { operator: "AND", filters: [] };

export function FarmDashboardClient({ farmId }: { farmId: string }) {
  const { role, isLoading: roleLoading, error: roleError } = useFarmRole(farmId);
  const [appliedReport, setAppliedReport] = useState<AppliedReport | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Farm Management</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Browse field data, build custom reports, and schedule recurring exports.
        </p>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-2">Field data</h2>
        <DataTable farmId={farmId} />
      </section>

      {roleLoading ? (
        <div className="p-4 text-sm text-zinc-500">Resolving your access…</div>
      ) : roleError ? (
        <div className="p-4 text-sm text-red-600">{roleError}</div>
      ) : !role ? (
        <div className="p-4 text-sm text-zinc-500">
          Could not determine your role for this farm.
        </div>
      ) : (
        <>
          <section>
            <h2 className="text-lg font-semibold mb-2">Build a report</h2>
            <ReportBuilder role={role} onApply={setAppliedReport} />
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Export</h2>
            {appliedReport ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {appliedReport.columns.length} column
                  {appliedReport.columns.length === 1 ? "" : "s"} ·{" "}
                  {appliedReport.filterGroup.filters.length} filter
                  {appliedReport.filterGroup.filters.length === 1 ? "" : "s"}
                </span>
                <ExportButton
                  farmId={farmId}
                  role={role}
                  filterGroup={appliedReport.filterGroup}
                  page={0}
                  pageSize={100}
                />
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm text-zinc-500">
                  Using default view (all columns, no filters)
                </span>
                <ExportButton
                  farmId={farmId}
                  role={role}
                  filterGroup={EMPTY_FILTER_GROUP}
                  page={0}
                  pageSize={100}
                />
              </div>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Scheduled reports</h2>
            <ScheduledReportConfig farmId={farmId} />
          </section>
        </>
      )}
    </div>
  );
}
