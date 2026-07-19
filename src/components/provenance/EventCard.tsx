"use client";

import { useState } from "react";
import { VerificationBadge } from "./VerificationBadge";
import type { ProvenanceEvent, VerificationResult } from "./types";

interface EventCardProps {
  event: ProvenanceEvent;
  onVerify: (eventId: string) => Promise<VerificationResult>;
}

export function EventCard({ event, onVerify }: EventCardProps) {
  const [open, setOpen] = useState(false);
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid="provenance-event-card">
      <button type="button" onClick={() => setOpen((value) => !value)} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">{event.event_type}</p>
            <h3 className="mt-1 font-semibold text-zinc-900">{event.location.name}</h3>
            <p className="text-sm text-zinc-500">{new Date(event.timestamp).toLocaleString()} · {event.custodian}</p>
          </div>
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">{event.status}</span>
        </div>
      </button>
      {open && (
        <div className="mt-4 space-y-4 border-t border-zinc-100 pt-4">
          <VerificationBadge eventId={event.id} onVerify={onVerify} />
          {event.temperatureLogs?.length ? <div><h4 className="text-sm font-bold">Temperature logs</h4><ul className="mt-2 text-sm text-zinc-600">{event.temperatureLogs.map((log) => <li key={`${log.timestamp}-${log.celsius}`}>{new Date(log.timestamp).toLocaleTimeString()}: {log.celsius}°C</li>)}</ul></div> : null}
          <div><h4 className="text-sm font-bold">Certificates</h4><div className="mt-2 grid gap-2">{event.certificates.map((certificate) => certificate.type === "pdf" ? <iframe key={certificate.id} src={certificate.uri} title={certificate.label} className="h-48 w-full rounded-lg border" /> : <a key={certificate.id} href={certificate.uri} target="_blank" rel="noreferrer" className="text-sm font-semibold text-emerald-700">{certificate.label} ↗</a>)}</div></div>
        </div>
      )}
    </article>
  );
}
