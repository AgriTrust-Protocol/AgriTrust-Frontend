"use client";

/**
 * Real-time batch status feed fed by the SSE certification stream.
 *
 * Hardened for high-throughput certification sprints (150-200 events in
 * ~2 seconds):
 *
 *  - Dedup: repeated upstream `eventId`s inside a 1s sliding window are
 *    dropped once, at ingest.
 *  - Batched state updates: incoming events land in a ref buffer and are
 *    spliced into React state in one `setEvents` per 50ms tick, cutting
 *    re-renders from one-per-event to a handful per sprint.
 *  - Stable keys: rows key on the UUIDv7 `generatedId` minted by
 *    eventService, so same-millisecond upstream ids can no longer make
 *    React drop visible items.
 */

import { useEffect, useRef, useState } from "react";
import {
  connectEventStream,
  createEventDeduper,
  type BatchEvent,
} from "@/src/api/services/eventService";
import { VirtualList } from "@/src/components/dashboard/virtualList";

export interface BatchStatusFeedProps {
  /** SSE endpoint. Default `/api/v1/events/stream`. */
  streamUrl?: string;
  /** Buffer flush cadence in ms. Default 50. */
  flushIntervalMs?: number;
  /** Dedup window in ms. Default 1000. */
  dedupWindowMs?: number;
  /** Viewport height of the virtualized list in px. */
  listHeight?: number;
  /** Fixed row height in px. */
  itemHeight?: number;
  /** Maximum events retained before oldest are trimmed. Default 500. */
  maxEvents?: number;
  /** Test/observability hook invoked once per applied batch. */
  onFlushApplied?: (batchSize: number) => void;
}

const TYPE_STYLES: Record<BatchEvent["type"], string> = {
  "batch.registered": "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  "batch.inspected": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "batch.certified": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "batch.shipped": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "batch.delivered": "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
};

export function BatchStatusFeed({
  streamUrl = "/api/v1/events/stream",
  flushIntervalMs = 50,
  dedupWindowMs = 1000,
  listHeight = 480,
  itemHeight = 56,
  maxEvents = 500,
  onFlushApplied,
}: BatchStatusFeedProps) {
  const [events, setEvents] = useState<readonly BatchEvent[]>([]);
  const pendingRef = useRef<BatchEvent[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFlushAppliedRef = useRef(onFlushApplied);

  // Keep the latest callback without touching refs during render.
  useEffect(() => {
    onFlushAppliedRef.current = onFlushApplied;
  }, [onFlushApplied]);

  useEffect(() => {
    let disposed = false;
    const deduper = createEventDeduper({ windowMs: dedupWindowMs });

    function applyPending() {
      const batch = pendingRef.current.splice(0);
      if (batch.length === 0) return;
      setEvents((prev) => {
        const merged = [...prev, ...batch];
        return merged.length > maxEvents
          ? merged.slice(merged.length - maxEvents)
          : merged;
      });
      onFlushAppliedRef.current?.(batch.length);
    }

    function scheduleFlush() {
      if (flushTimerRef.current !== null) return;
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        applyPending();
      }, flushIntervalMs);
    }

    const closeStream = connectEventStream(streamUrl, {
      onEvent: (event) => {
        if (disposed) return;
        // Duplicate suppression happens before buffering so replays
        // never consume render capacity.
        if (!deduper.check(event.eventId)) return;

        pendingRef.current.push(event);
        scheduleFlush();
      },
    });

    return () => {
      disposed = true;
      closeStream();
      if (flushTimerRef.current !== null) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
      deduper.clear();
    };
  }, [streamUrl, flushIntervalMs, dedupWindowMs, maxEvents]);

  return (
    <section className="space-y-2" aria-label="Batch status feed">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Batch Status Feed
        </h2>
        <span
          data-testid="batch-event-count"
          className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400"
        >
          {events.length} events
        </span>
      </div>

      {events.length === 0 ? (
        <p
          data-testid="batch-feed-empty"
          className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-400 dark:border-zinc-700 dark:text-zinc-500"
        >
          Listening for certification events...
        </p>
      ) : (
        <VirtualList
          items={events}
          itemHeight={itemHeight}
          height={listHeight}
          getItemKey={(event) => event.generatedId}
          renderItem={(event) => (
            <div
              data-testid="batch-event"
              className="flex h-full items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 dark:border-zinc-700"
            >
              <span className="truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
                {event.batchId}
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_STYLES[event.type]}`}
              >
                {event.type}
              </span>
            </div>
          )}
        />
      )}
    </section>
  );
}
