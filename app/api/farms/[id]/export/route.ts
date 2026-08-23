// app/api/farms/[id]/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { ColumnFilter, FarmRow, FilterGroup } from "@/src/types/farm";
import { ROLE_COLUMN_ACCESS, type FarmRole } from "@/src/types/farm";

// ── Reuse the same mock dataset used by the data route ─────────────────
// TODO: replace with a real query against the farm records store, shared
// with app/api/farms/[id]/data/route.ts once that's backed by a real DB.
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

function matchesFilter(row: FarmRow, filter: ColumnFilter): boolean {
  const cellValue = row[filter.columnId];
  if (filter.type === "text") {
    return String(cellValue ?? "")
      .toLowerCase()
      .includes(String(filter.value).toLowerCase());
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
  return rows.filter((row) =>
    group.operator === "AND"
      ? group.filters.every((f) => matchesFilter(row, f))
      : group.filters.some((f) => matchesFilter(row, f))
  );
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsv(rows: FarmRow[], columns: (keyof FarmRow)[]): string {
  const header = columns.join(",");
  const lines = rows.map((row) =>
    columns.map((col) => csvEscape(String(row[col] ?? ""))).join(",")
  );
  return [header, ...lines].join("\n");
}

/**
 * Minimal single/multi-page PDF built by hand (no external PDF library).
 * Renders a simple monospace table listing the given rows/columns.
 * Good enough for the "current view" export; swap for a proper PDF
 * library (e.g. pdf-lib) if richer formatting is needed later.
 */
function toPdf(rows: FarmRow[], columns: (keyof FarmRow)[]): Buffer {
  const linesPerPage = 45;
  const fontSize = 9;
  const lineHeight = 12;
  const startY = 780;

  function escapePdfText(text: string): string {
    return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }

  const headerLine = columns.join("  |  ");
  const dataLines = rows.map((row) =>
    columns.map((col) => String(row[col] ?? "")).join("  |  ")
  );
  const allLines = [headerLine, "-".repeat(headerLine.length), ...dataLines];

  const pages: string[][] = [];
  for (let i = 0; i < allLines.length; i += linesPerPage) {
    pages.push(allLines.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) pages.push([]);

  const objects: string[] = [];
  const pageObjIds: number[] = [];
  let objId = 1;

  // Reserve object 1 for the Pages catalog; fill in later.
  const pagesObjId = objId++;
  const fontObjId = objId++;

  const contentObjIds: number[] = [];
  for (const pageLines of pages) {
    const pageContentId = objId++;
    const pageId = objId++;
    contentObjIds.push(pageContentId);
    pageObjIds.push(pageId);

    let content = `BT /F1 ${fontSize} Tf ${startY} Td\n`;
    for (const line of pageLines) {
      content += `(${escapePdfText(line)}) Tj 0 -${lineHeight} Td\n`;
    }
    content += "ET";

    objects[pageContentId] = `${pageContentId} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`;
    objects[pageId] = `${pageId} 0 obj\n<< /Type /Page /Parent ${pagesObjId} 0 R /Resources << /Font << /F1 ${fontObjId} 0 R >> >> /MediaBox [0 0 612 792] /Contents ${pageContentId} 0 R >>\nendobj\n`;
  }

  objects[fontObjId] = `${fontObjId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n`;
  objects[pagesObjId] = `${pagesObjId} 0 obj\n<< /Type /Pages /Kids [${pageObjIds
    .map((id) => `${id} 0 R`)
    .join(" ")}] /Count ${pageObjIds.length} >>\nendobj\n`;

  const catalogObjId = objId++;
  objects[catalogObjId] = `${catalogObjId} 0 obj\n<< /Type /Catalog /Pages ${pagesObjId} 0 R >>\nendobj\n`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 1; i < objId; i++) {
    if (!objects[i]) continue;
    offsets[i] = Buffer.byteLength(pdf, "latin1");
    pdf += objects[i];
  }
  const xrefStart = Buffer.byteLength(pdf, "latin1");
  const objectCount = objId;
  pdf += `xref\n0 ${objectCount}\n0000000000 65535 f \n`;
  for (let i = 1; i < objectCount; i++) {
    const offset = offsets[i] ?? 0;
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objectCount} /Root ${catalogObjId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params;

  const searchParams = request.nextUrl.searchParams;
  const format = searchParams.get("format");
  const role = (searchParams.get("role") as FarmRole | null) ?? "Viewer";

  if (format !== "csv" && format !== "pdf") {
    return NextResponse.json(
      { error: "format must be 'csv' or 'pdf'" },
      { status: 400 }
    );
  }

  const columns = ROLE_COLUMN_ACCESS[role] ?? ROLE_COLUMN_ACCESS.Viewer;

  let filterGroup: FilterGroup = { operator: "AND", filters: [] };
  const filterParam = searchParams.get("filters");
  if (filterParam) {
    try {
      filterGroup = JSON.parse(filterParam) as FilterGroup;
    } catch {
      return NextResponse.json({ error: "Invalid filters param" }, { status: 400 });
    }
  }

  const allFiltered = applyFilterGroup(getAllRows(), filterGroup);

  if (format === "csv") {
    // CSV: full filtered dataset, no pagination.
    const csv = toCsv(allFiltered, columns);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="farm-export.csv"',
      },
    });
  }

  // PDF: current view only — page/pageSize passed through from the client.
  const page = Math.max(0, Number(searchParams.get("page") ?? "0"));
  const pageSize = Math.min(500, Math.max(1, Number(searchParams.get("pageSize") ?? "100")));
  const start = page * pageSize;
  const pageRows = allFiltered.slice(start, start + pageSize);

  const pdfBuffer = toPdf(pageRows, columns);
  return new NextResponse(pdfBuffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="farm-export.pdf"',
    },
  });
}
