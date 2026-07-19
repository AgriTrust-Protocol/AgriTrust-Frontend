import { FarmDashboardShell } from "@/src/components/farm/FarmDashboardShell";
import type { FarmDataRow } from "@/src/hooks/useFarmData";

const crops = ["Maize", "Cassava", "Rice", "Sorghum"];

function makeRows(count: number): FarmDataRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `demo-${index}`,
    fieldName: index % 2 === 0 ? `North Field ${index}` : `South Field ${index}`,
    crop: crops[index % crops.length],
    plantingDate: `2026-${String((index % 12) + 1).padStart(2, "0")}-15`,
    expectedYield: 3 + (index % 7),
    actualYield: 2 + (index % 6),
    inputCosts: 100 + index,
    revenue: 500 + index * 2,
  }));
}

export default function FarmDashboardPage() {
  const demoRows = makeRows(10_000);

  return <FarmDashboardShell farmId="demo-farm" role="FarmOperator" rows={demoRows} />;
}
