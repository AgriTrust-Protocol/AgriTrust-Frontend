// app/api/farms/[id]/data/route.ts
import { NextRequest, NextResponse } from "next/server";
import type {
  ColumnFilter,
  FarmDataResponse,
  FarmRow,
  FilterGroup,
  SortState,
} from "@/src/types/farm";

// ── Mock dataset (generated once per server process) ─────────────────
// TODO: replace with a real query against the farm records store.
const CROPS = ["Maize", "Wheat", "Sorghum", "Soybean", "Rice", "Barley"];

function generateMockRows(count: number): FarmRow[] {
  const rows: FarmRow[] = [];
  for (let i = 0; i < count; i++) {
    const expectedYield = 1000 + Math.round(Math.random() * 4000);
    const actualYield =
      Math.random() > 0.1
        ? Math.round(expectedYield * (0.7 + Math.random() * 0.5))
        : null;
    const inputCosts = 500 + Math.round(Math.random() * 3000);
    const revenue = Math.round((actualYield ?? 0) * (2 + Math.random() * 3));
    const day = 1 + Math.floor(Math.random() * 27);
    const month = 1 + Math.floor(Math.random() * 12);
    rows.push({
      id: `field-${i + 1}`,
      fieldName: `Field ${i + 1}`,
      crop: CROPS[i % CROPS.length],
      plantingDate: `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      expectedYield,
      actualYield,
      inputCosts,
      revenue,
    });
  }
  return rows;
}

let cachedRows: FarmRow[] | null = null;
function getAllRows(): FarmRow[] {
  if (!cachedRows) {
    cachedRows = generateMockRows(12_000);
  }
  return cachedRows;
}

// ── Filtering ───────────────────────────────────────────────────────
function matchesFilter(row: FarmRow, filter: ColumnFilter): boolean {
  const cellValue = row[filter.columnId];

  if (filter.type === "text") {
    const needle = String(filter.value).toLowerCase();
    return String(cellValue ?? "").toLowerCase().includes(needle);
  }

  if (filter.type === "select") {
    return String(cellValue ?? "") === String(filter.value);
  }

  if (filter.type === "dateRange" && Array.isArray(filter.value)) {
    const [from, to] = filter.value;
    const cellDate = String(cellValue ?? "");
    if (from && cellDate < from) return false;
    if (to && cellDate > to) return false;
    return true;
  }

  return true;
}

function applyFilterGroup(rows: FarmRow[], group: FilterGroup): FarmRow[] {
  if (!group.filters.length) return rows;
  return rows.filter((row) => {
    if (group.operator === "AND") {
      return group.filters.every((f) => matchesFilter(row, f));
    }
    return group.filters.some((f) => matchesFilter(row, f));
  });
}

function applySorting(rows: FarmRow[], sorting: SortState[]): FarmRow[] {
  if (!sorting.length) return rows;
  const sorted = [...rows];
  sorted.sort((a, b) => {
    for (const s of sorting) {
      const av = a[s.id];
      const bv = b[s.id];
      let cmp = 0;
      if (av == null && bv == null) cmp = 0;
      else if (av == null) cmp = -1;
      else if (bv == null) cmp = 1;
      else if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      if (cmp !== 0) return s.desc ? -cmp : cmp;
    }
    return 0;
  });
  return sorted;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params; // farmId not yet used by the mock store, but required by the route contract

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(0, Number(searchParams.get("page") ?? "0"));
  const pageSize = Math.min(500, Math.max(1, Number(searchParams.get("pageSize") ?? "100")));

  let filterGroup: FilterGroup = { operator: "AND", filters: [] };
  const filterParam = searchParams.get("filters");
  if (filterParam) {
    try {
      filterGroup = JSON.parse(filterParam) as FilterGroup;
    } catch {
      return NextResponse.json({ error: "Invalid filters param" }, { status: 400 });
    }
  }

  let sorting: SortState[] = [];
  const sortParam = searchParams.get("sort");
  if (sortParam) {
    try {
      sorting = JSON.parse(sortParam) as SortState[];
    } catch {
      return NextResponse.json({ error: "Invalid sort param" }, { status: 400 });
    }
  }

  const filtered = applyFilterGroup(getAllRows(), filterGroup);
  const sorted = applySorting(filtered, sorting);
  const start = page * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);

  const response: FarmDataResponse = {
    rows: pageRows,
    totalCount: filtered.length,
    page,
    pageSize,
  };

  return NextResponse.json(response);
}
