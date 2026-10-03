/* Authorized Protocol Quality Assurance & Formal Verification Test Suite */
'use client';

import React, { useMemo } from 'react';
import { CustodyEvent } from '../../types/provenance';
import { EventCard } from './EventCard';

interface EventTimelineProps {
  events: CustodyEvent[];
  orientation?: 'auto' | 'vertical' | 'horizontal';
  filterType?: string | null;
}

export const EventTimeline: React.FC<EventTimelineProps> = ({
  events,
  orientation = 'auto',
  filterType = null,
}) => {
  // Sort events chronologically (oldest to newest for supply chain journey)
  const sortedEvents = useMemo(() => {
    let list = [...events].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    if (filterType) {
      list = list.filter((e) => e.event_type === filterType);
    }
    return list;
  }, [events, filterType]);

  if (sortedEvents.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200">
        <p className="text-slate-500 text-sm">No custody events recorded for this batch yet.</p>
      </div>
    );
  }

  return (
    <div className="w-full" data-testid="event-timeline-container">
      {/* Desktop View: Vertical Connected Timeline */}
      <div
        className={`${
          orientation === 'horizontal'
            ? 'hidden'
            : orientation === 'vertical'
            ? 'block'
            : 'hidden md:block'
        } relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200`}
      >
        {sortedEvents.map((event, idx) => (
          <div key={event.id} className="relative group">
            {/* Timeline connector node */}
            <div
              className="absolute -left-6 top-4 w-5 h-5 rounded-full border-2 border-white bg-slate-400 group-hover:bg-emerald-500 shadow-xs transition-colors flex items-center justify-center text-[10px] font-bold text-white z-10"
              title={`Step ${idx + 1}: ${event.event_type}`}
            >
              {idx + 1}
            </div>

            <EventCard event={event} isExpandedInitial={idx === sortedEvents.length - 1} />
          </div>
        ))}
      </div>

      {/* Mobile View: Horizontal Scrollable Timeline */}
      <div
        className={`${
          orientation === 'vertical'
            ? 'hidden'
            : orientation === 'horizontal'
            ? 'block'
            : 'block md:hidden'
        } overflow-x-auto pb-4 pt-2 -mx-4 px-4 scrollbar-thin`}
      >
        <div className="flex gap-4 min-w-max">
          {sortedEvents.map((event, idx) => (
            <div key={event.id} className="w-[310px] shrink-0">
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center">
                  {idx + 1}
                </span>
                <span className="text-xs font-semibold text-slate-700 capitalize">
                  {event.event_type}
                </span>
                {idx < sortedEvents.length - 1 && (
                  <div className="flex-1 h-0.5 bg-slate-200 mx-2" />
                )}
              </div>
              <EventCard event={event} isExpandedInitial={false} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
