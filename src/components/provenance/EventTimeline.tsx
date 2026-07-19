"use client";

import { EventCard } from "./EventCard";
import type { ProvenanceEvent, VerificationResult } from "./types";

interface EventTimelineProps {
  events: ProvenanceEvent[];
  onVerify: (eventId: string) => Promise<VerificationResult>;
}

export function EventTimeline({ events, onVerify }: EventTimelineProps) {
  const sorted = [...events].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  return (
    <section aria-label="Custody timeline" className="overflow-x-auto md:overflow-visible">
      <ol className="flex min-w-max gap-4 border-l-0 border-emerald-200 md:block md:min-w-0 md:space-y-5 md:border-l-2 md:pl-6">
        {sorted.map((event) => (
          <li key={event.id} className="relative w-80 md:w-auto">
            <span className="absolute -left-8 top-5 hidden h-4 w-4 rounded-full border-2 border-white bg-emerald-600 shadow md:block" />
            <EventCard event={event} onVerify={onVerify} />
          </li>
        ))}
      </ol>
    </section>
  );
}
