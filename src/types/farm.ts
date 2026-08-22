// src/types/farm.ts

export type FarmRole = "FarmOperator" | "Agronomist" | "Accountant" | "Viewer";

export interface FarmRow {
  id: string;
  fieldName: string;
  crop: string;
  plantingDate: string; // ISO date
  expectedYield: number;
  actualYield: number | null;
  inputCosts: number;
  revenue: number;
}

/** Columns visible to each role. FarmOperator sees everything. */
export const ROLE_COLUMN_ACCESS: Record<FarmRole, (keyof FarmRow)[]> = {
  FarmOperator: [
    "fieldName",
    "crop",
    "plantingDate",
    "expectedYield",
    "actualYield",
    "inputCosts",
    "revenue",
  ],
  Agronomist: ["fieldName", "crop", "plantingDate", "expectedYield", "actualYield"],
  Accountant: ["fieldName", "inputCosts", "revenue"],
  Viewer: ["fieldName", "crop", "plantingDate", "expectedYield", "actualYield"],
};

export type FilterOperator = "AND" | "OR";

export interface ColumnFilter {
  id: string;
  columnId: keyof FarmRow;
  /** "text" -> contains match, "dateRange" -> [from, to], "select" -> exact match */
  type: "text" | "dateRange" | "select";
  value: string | [string, string];
}

export interface FilterGroup {
  operator: FilterOperator;
  filters: ColumnFilter[];
}

export interface SortState {
  id: keyof FarmRow;
  desc: boolean;
}

export interface FarmDataQuery {
  page: number; // 0-indexed
  pageSize: number; // fixed at 100 per spec
  sorting: SortState[];
  filterGroup: FilterGroup;
}

export interface FarmDataResponse {
  rows: FarmRow[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface ReportConfig {
  id: string;
  name: string;
  columns: (keyof FarmRow)[];
  filterGroup: FilterGroup;
  sorting: SortState[];
  createdAt: string;
}

export type ExportFormat = "csv" | "pdf";
export type ScheduleFrequency = "daily" | "weekly" | "monthly";

export interface ScheduledReportConfig {
  id: string;
  farmId: string;
  reportConfigId: string | null;
  frequency: ScheduleFrequency;
  recipients: string[];
  format: ExportFormat;
}
