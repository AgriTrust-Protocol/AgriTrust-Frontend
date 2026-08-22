// app/dashboard/farm/[farmId]/page.tsx
import { FarmDashboardClient } from "./FarmDashboardClient";

export default async function FarmDashboardPage({
  params,
}: {
  params: Promise<{ farmId: string }>;
}) {
  const { farmId } = await params;
  return <FarmDashboardClient farmId={farmId} />;
}
