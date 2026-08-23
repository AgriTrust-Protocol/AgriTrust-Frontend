import { ConsumerLagTable } from "@/src/components/observability/ConsumerLagTable";
import { BatchStatusFeed } from "@/src/components/dashboard/BatchStatusFeed";

export default function OperationsPage() {
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold">Operations</h1><p className="mt-1 text-zinc-600 dark:text-zinc-400">Consumer-group health and delivery backlog.</p></div><ConsumerLagTable /><BatchStatusFeed /></div>;
}
