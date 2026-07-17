import { getDatabasePool } from "@/src/server/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Prometheus scrape endpoint; keep this behind platform/network authentication. */
export function GET(): Response {
  const metrics = getDatabasePool()?.getMetrics();
  const lines = [
    "# HELP agritrust_database_probe_total Database health probes completed.",
    "# TYPE agritrust_database_probe_total counter",
    `agritrust_database_probe_total ${metrics?.probesTotal ?? 0}`,
    "# HELP agritrust_database_probe_failures_total Database health probe failures.",
    "# TYPE agritrust_database_probe_failures_total counter",
    `agritrust_database_probe_failures_total ${metrics?.probeFailuresTotal ?? 0}`,
    "# HELP agritrust_database_pool_target_connections Current adaptive pool target.",
    "# TYPE agritrust_database_pool_target_connections gauge",
    `agritrust_database_pool_target_connections ${metrics?.targetSize ?? 0}`,
    "# HELP agritrust_database_pool_ewma_latency_ms EWMA database probe latency.",
    "# TYPE agritrust_database_pool_ewma_latency_ms gauge",
    `agritrust_database_pool_ewma_latency_ms ${metrics?.ewmaLatencyMs ?? 0}`,
  ];
  return new Response(`${lines.join("\n")}\n`, { headers: { "Content-Type": "text/plain; version=0.0.4", "Cache-Control": "no-store" } });
}
