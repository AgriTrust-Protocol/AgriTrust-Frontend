"use client";

import { useEffect, useState } from "react";
import { summarizeConsumerLag } from "@/src/services/kafka/consumerLag";
import type { ConsumerLagSample } from "@/src/types/kafka";

const ENDPOINT = "/api/observability/kafka/consumer-lag";

/** A read-only operations dashboard; the API remains the source of truth. */
export function ConsumerLagTable() {
  const [samples, setSamples] = useState<ConsumerLagSample[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(ENDPOINT, { signal: controller.signal, headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`Telemetry request failed (${response.status})`);
        const payload: unknown = await response.json();
        if (!Array.isArray(payload)) throw new Error("Telemetry response must be an array.");
        const telemetry = payload as ConsumerLagSample[];
        // Validate before committing data so a malformed upstream payload cannot break rendering.
        summarizeConsumerLag(telemetry);
        setSamples(telemetry);
        setError(null);
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Unable to load Kafka telemetry.");
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), 30_000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, []);

  const groups = summarizeConsumerLag(samples);
  return <section aria-labelledby="consumer-lag-heading" className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
    <div className="mb-4 flex items-baseline justify-between"><h2 id="consumer-lag-heading" className="text-lg font-semibold">Kafka consumer lag</h2><span className="text-xs text-zinc-500">Refreshes every 30 seconds</span></div>
    {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
    {!error && groups.length === 0 ? <p className="text-sm text-zinc-500">No consumer-lag telemetry is available.</p> : null}
    {groups.length > 0 ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-zinc-500"><tr><th className="pb-2">Consumer group</th><th className="pb-2">Total lag</th><th className="pb-2">Members</th><th className="pb-2">Status</th><th className="pb-2">Observed</th></tr></thead><tbody>{groups.map((group) => <tr key={group.consumerGroup} className="border-b border-zinc-100 dark:border-zinc-900"><td className="py-3 font-medium">{group.consumerGroup}</td><td className="py-3">{group.totalLag.toLocaleString()}</td><td className="py-3">{group.memberCount}</td><td className="py-3"><span className={group.severity === "critical" ? "text-red-600" : group.severity === "warning" ? "text-amber-600" : "text-green-600"}>{group.severity}</span></td><td className="py-3 text-zinc-500">{new Date(group.observedAt).toLocaleTimeString()}</td></tr>)}</tbody></table></div> : null}
  </section>;
}
