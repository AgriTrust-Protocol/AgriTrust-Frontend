import { describe, expect, it } from "vitest";
import { applyFarmQuery, type FarmDataRow } from "@/src/hooks/useFarmData";

const crops = ["Maize", "Cassava", "Rice", "Sorghum"];

function makeRows(count: number): FarmDataRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `row-${index}`,
    fieldName: index % 2 === 0 ? `North Field ${index}` : `South Field ${index}`,
    crop: crops[index % crops.length],
    plantingDate: `2026-${String((index % 12) + 1).padStart(2, "0")}-15`,
    expectedYield: 3 + (index % 7),
    actualYield: 2 + (index % 6),
    inputCosts: 100 + index,
    revenue: 500 + index * 2,
  }));
}

describe("applyFarmQuery", () => {
  it("filters a 10K row farm dataset with three column filters and paginates the API-shaped response", () => {
    const rows = makeRows(10_000);
    const response = applyFarmQuery(rows, {
      pageIndex: 0,
      pageSize: 100,
      filterCombinator: "AND",
      filters: [
        { id: "field", column: "fieldName", operator: "contains", value: "North" },
        { id: "crop", column: "crop", operator: "equals", value: "Maize" },
        { id: "yield", column: "actualYield", operator: "gte", value: "4" },
      ],
      sorting: [{ column: "revenue", direction: "desc" }],
      visibleColumns: ["fieldName", "crop", "plantingDate", "expectedYield", "actualYield", "inputCosts", "revenue"],
    });

    const expectedCount = rows.filter((row) => row.fieldName.includes("North") && row.crop === "Maize" && row.actualYield >= 4).length;
    expect(response.filteredRows).toBe(expectedCount);
    expect(response.rows).toHaveLength(100);
    expect(response.rows[0].revenue).toBeGreaterThanOrEqual(response.rows[1].revenue);
  });
});
