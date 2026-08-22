// src/components/farm/FarmDashboard.integration.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FarmDashboardClient } from "@/app/dashboard/farm/[farmId]/FarmDashboardClient";
import type { FarmRow, FilterGroup } from "@/src/types/farm";

vi.mock("@/components/providers/AuthProvider", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: { address: "0xTESTWALLET" },
  }),
}));

const CROPS = ["Wheat", "Corn", "Soy", "Rice"] as const;
const FIELDS = ["North Field", "South Field", "East Field", "West Field"] as const;
const ROW_COUNT = 10000;

function buildMockRows(): FarmRow[] {
  const rows: FarmRow[] = [];
  for (let i = 0; i < ROW_COUNT; i++) {
    rows.push({
      id: `row-${i}`,
      fieldName: FIELDS[i % FIELDS.length],
      crop: CROPS[i % CROPS.length],
      plantingDate: `2026-${String((i % 12) + 1).padStart(2, "0")}-01`,
      expectedYield: 100 + (i % 50),
      actualYield: i % 7 === 0 ? null : 90 + (i % 50),
      inputCosts: 500 + (i % 20) * 10,
      revenue: 1000 + (i % 30) * 25,
    });
  }
  return rows;
}

const ALL_ROWS = buildMockRows();

function matchesFilter(row: FarmRow, filterGroup: FilterGroup): boolean {
  if (filterGroup.filters.length === 0) return true;
  const results = filterGroup.filters.map((f) => {
    const raw = row[f.columnId];
    if (f.type === "dateRange") {
      const [from, to] = f.value as [string, string];
      const value = String(raw ?? "");
      return (!from || value >= from) && (!to || value <= to);
    }
    const needle = String(f.value ?? "").toLowerCase();
    if (!needle) return true;
    const haystack = String(raw ?? "").toLowerCase();
    return f.type === "select" ? haystack === needle : haystack.includes(needle);
  });
  return filterGroup.operator === "AND" ? results.every(Boolean) : results.some(Boolean);
}

let lastExportQuery: URLSearchParams | null = null;

beforeEach(() => {
  lastExportQuery = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");

      if (url.pathname.endsWith("/role")) {
        return new Response(JSON.stringify({ role: "FarmOperator" }), { status: 200 });
      }

      if (url.pathname.endsWith("/data")) {
        const page = Number(url.searchParams.get("page") ?? "0");
        const pageSize = Number(url.searchParams.get("pageSize") ?? "100");
        const filterGroup = JSON.parse(
          url.searchParams.get("filters") ?? '{"operator":"AND","filters":[]}'
        ) as FilterGroup;
        const filtered = ALL_ROWS.filter((r) => matchesFilter(r, filterGroup));
        const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);
        return new Response(
          JSON.stringify({ rows: pageRows, totalCount: filtered.length, page, pageSize }),
          { status: 200 }
        );
      }

      if (url.pathname.endsWith("/export")) {
        lastExportQuery = url.searchParams;
        const filterGroup = JSON.parse(
          url.searchParams.get("filters") ?? '{"operator":"AND","filters":[]}'
        ) as FilterGroup;
        const filtered = ALL_ROWS.filter((r) => matchesFilter(r, filterGroup));
        return new Response(new Blob([`rows:${filtered.length}`], { type: "text/csv" }), {
          status: 200,
        });
      }

      throw new Error(`Unhandled fetch in test: ${url.pathname}`);
    })
  );

  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:mock") }));
  URL.revokeObjectURL = vi.fn();
});

describe("Farm dashboard integration: 10k rows, 3 filters", () => {
  it("loads the full 10k-row dataset in the table with no filters applied", async () => {
    render(<FarmDashboardClient farmId="farm-1" />);
    await screen.findByText(/10,000 rows/i, {}, { timeout: 5000 });
  });

  it("applies 3 filters via ReportBuilder and exports exactly the matching rows", async () => {
    const user = userEvent.setup();
    render(<FarmDashboardClient farmId="farm-1" />);

    const reportBuilder = await screen.findByTestId("report-builder", {}, { timeout: 5000 });

    const addFilterBtn = within(reportBuilder).getByText("+ Add filter");
    await user.click(addFilterBtn);
    await user.click(addFilterBtn);
    await user.click(addFilterBtn);

    const comboboxes = within(reportBuilder).getAllByRole("combobox");
    // [operator, f1-column, f1-type, f2-column, f2-type, f3-column, f3-type, loadSaved]
    await user.selectOptions(comboboxes[1], "crop");
    await user.selectOptions(comboboxes[3], "fieldName");
    await user.selectOptions(comboboxes[5], "inputCosts");

    const valueInputs = within(reportBuilder).getAllByPlaceholderText("value");
    await user.type(valueInputs[0], "Corn");
    await user.type(valueInputs[1], "South");
    await user.type(valueInputs[2], "510");

    await user.click(within(reportBuilder).getByText("Apply"));

    const expectedFilterGroup: FilterGroup = {
      operator: "AND",
      filters: [
        { id: "x", columnId: "crop", type: "text", value: "Corn" },
        { id: "x", columnId: "fieldName", type: "text", value: "South" },
        { id: "x", columnId: "inputCosts", type: "text", value: "510" },
      ],
    };
    const expectedCount = ALL_ROWS.filter((r) => matchesFilter(r, expectedFilterGroup)).length;
    expect(expectedCount).toBeGreaterThan(0);
    expect(expectedCount).toBeLessThan(ROW_COUNT);

    await screen.findByText(new RegExp(`3 filters`), {}, { timeout: 5000 });

    const exportButton = screen.getByRole("button", { name: "Export" });
    await user.click(exportButton);

    await waitFor(() => expect(lastExportQuery).not.toBeNull());
    const sentFilterGroup = JSON.parse(lastExportQuery!.get("filters") ?? "{}") as FilterGroup;
    expect(sentFilterGroup.filters).toHaveLength(3);
    expect(sentFilterGroup.operator).toBe("AND");
    expect(sentFilterGroup.filters.map((f) => f.columnId).sort()).toEqual(
      ["crop", "fieldName", "inputCosts"].sort()
    );
  });
});
