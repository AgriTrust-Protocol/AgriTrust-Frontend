/**
 * analyticsDataProcessor.worker.ts
 *
 * Web Worker that offloads heavy sort / filter / aggregate operations from the
 * main thread.  The worker receives a PROCESS message, executes the requested
 * pipeline stages sequentially (filter → sort → aggregate), and streams
 * PROGRESS events back at every 10 % of records processed.
 *
 * Message protocol
 * ─────────────────
 * Inbound  (main → worker):
 *   { type: 'PROCESS', requestId: string, payload: ProcessPayload }
 *   { type: 'CANCEL',  requestId: string }
 *
 * Outbound (worker → main):
 *   { type: 'PROGRESS', requestId: string, percent: number }
 *   { type: 'RESULT',   requestId: string, result: ProcessResult }
 *   { type: 'ERROR',    requestId: string, error: string }
 *
 * Design notes
 * ─────────────
 * • The worker guards its listener registration with `typeof window === 'undefined'`
 *   so the module can be imported in jsdom tests without side-effects.
 * • Processing is split into microtask-sized PROGRESS checkpoints via
 *   `queueMicrotask` so the worker event-loop stays responsive to CANCEL
 *   messages between stages.
 * • The exported `processAnalyticsData` function is importable for unit-tests.
 */

import {
  sortRows,
  filterRows,
  aggregateRows,
  type AnalyticsRecord,
  type AggregateOptions,
  type AggregateResult,
} from "@/src/utils/dataPipeline";
import type { SortState, FilterGroup, FarmRow } from "@/src/types/farm";

// ─── Message types ────────────────────────────────────────────────────────

export interface ProcessPayload {
  /** The raw records to process (FarmRow[] serialised through structured-clone) */
  data: FarmRow[];
  operations: ProcessOperations;
}

export interface ProcessOperations {
  /** Applied first, before sort */
  filter?: FilterGroup;
  /** Applied after filter */
  sort?: SortState[];
  /** Applied last; omit to return flat rows instead */
  aggregate?: AggregateOptions;
}

export interface ProcessResult {
  rows: FarmRow[];
  aggregated?: AggregateResult[];
  /** Number of rows before filtering */
  totalInput: number;
  /** Number of rows after filtering */
  filteredCount: number;
  /** Wall-clock time in ms */
  durationMs: number;
}

export type WorkerInbound =
  | { type: "PROCESS"; requestId: string; payload: ProcessPayload }
  | { type: "CANCEL"; requestId: string };

export type WorkerOutbound =
  | { type: "PROGRESS"; requestId: string; percent: number }
  | { type: "RESULT"; requestId: string; result: ProcessResult }
  | { type: "ERROR"; requestId: string; error: string };

// ─── Cancellation registry ────────────────────────────────────────────────

const cancelledRequests = new Set<string>();

// ─── Core processing logic ────────────────────────────────────────────────

/**
 * Execute the analytics pipeline stages and post PROGRESS events back via the
 * provided `postFn`.  Exported for direct unit-test use.
 */
export async function processAnalyticsData(
  requestId: string,
  payload: ProcessPayload,
  postFn: (msg: WorkerOutbound) => void
): Promise<void> {
  const t0 = Date.now();
  const { data, operations } = payload;
  const totalInput = data.length;

  try {
    // ── Stage 1: Filter (0 % → 33 %) ─────────────────────────────────────
    postFn({ type: "PROGRESS", requestId, percent: 0 });

    if (cancelledRequests.has(requestId)) return;

    let rows: FarmRow[] = operations.filter
      ? (filterRows(data as AnalyticsRecord[], operations.filter) as FarmRow[])
      : [...data];

    const filteredCount = rows.length;

    // Yield to the event loop so a pending CANCEL message can be processed.
    await yieldToEventLoop();

    if (cancelledRequests.has(requestId)) return;
    postFn({ type: "PROGRESS", requestId, percent: 33 });

    // ── Stage 2: Sort (33 % → 66 %) ──────────────────────────────────────
    if (operations.sort && operations.sort.length > 0) {
      rows = sortRows(rows as AnalyticsRecord[], operations.sort) as FarmRow[];
    }

    await yieldToEventLoop();

    if (cancelledRequests.has(requestId)) return;
    postFn({ type: "PROGRESS", requestId, percent: 66 });

    // ── Stage 3: Aggregate (66 % → 100 %) ────────────────────────────────
    let aggregated: AggregateResult[] | undefined;
    if (operations.aggregate) {
      aggregated = aggregateRows(rows as AnalyticsRecord[], operations.aggregate);
    }

    await yieldToEventLoop();

    if (cancelledRequests.has(requestId)) return;
    postFn({ type: "PROGRESS", requestId, percent: 100 });

    const durationMs = Date.now() - t0;

    postFn({
      type: "RESULT",
      requestId,
      result: {
        rows,
        aggregated,
        totalInput,
        filteredCount,
        durationMs,
      },
    });
  } catch (err) {
    postFn({
      type: "ERROR",
      requestId,
      error: err instanceof Error ? err.message : "Unknown processing error",
    });
  } finally {
    cancelledRequests.delete(requestId);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Defer to the micro-task queue so pending messages can be handled. */
function yieldToEventLoop(): Promise<void> {
  return new Promise<void>((resolve) => queueMicrotask(resolve));
}

// ─── Worker message listener (skipped in test / SSR environments) ─────────

if (
  typeof window === "undefined" &&
  typeof globalThis.addEventListener === "function" &&
  typeof globalThis.postMessage === "function"
) {
  globalThis.addEventListener(
    "message",
    async (event: MessageEvent<WorkerInbound>) => {
      const msg = event.data;

      if (msg.type === "CANCEL") {
        cancelledRequests.add(msg.requestId);
        return;
      }

      if (msg.type === "PROCESS") {
        await processAnalyticsData(msg.requestId, msg.payload, (outbound) => {
          globalThis.postMessage(outbound);
        });
      }
    }
  );
}
