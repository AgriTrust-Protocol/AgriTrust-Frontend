"use client";

import { EventTimeline } from "./EventTimeline";
import { ProvenanceMap } from "./ProvenanceMap";
import { QRGenerator } from "./QRGenerator";
import { useProvenance } from "@/src/hooks/useProvenance";
import type { ProvenanceBatch } from "./types";

export function ProvenanceTraceability({ batchId, initialData }: { batchId: string; initialData?: ProvenanceBatch }) {
  const { data, events, isLoading, error, verifyEvent } = useProvenance(batchId, initialData);

  if (isLoading) return <p className="p-6 text-sm text-zinc-500">Loading provenance chain…</p>;
  if (error) return <p className="p-6 text-sm text-red-700">{error}</p>;

  return (
    <main className="bg-[#f7faf7] p-5 text-zinc-900 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Traceability</p>
        <h1 className="mt-2 text-3xl font-bold">{data?.productName ?? "Product"} provenance</h1>
        <p className="mt-2 text-sm text-zinc-600">Batch {batchId} from farm to table with verifiable custody events.</p>
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <ProvenanceMap events={events} />
          <QRGenerator batchId={batchId} />
        </div>
        <div className="mt-8">
          <EventTimeline events={events} onVerify={verifyEvent} />
        </div>
      </div>
    </main>
  );
}
