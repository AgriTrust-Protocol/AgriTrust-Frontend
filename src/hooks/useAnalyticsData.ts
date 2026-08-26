/**
 * useAnalyticsData.ts
 *
 * React hook that owns the lifecycle of the analyticsDataProcessor Web Worker
 * and exposes a clean, reactive API for the AnalyticsTable component.
 *
 * Features
 * ─────────
 * • WorkerRef – the Worker instance persists across renders inside a ref so
 *   it is created once and terminated on unmount.
 * • Request-ID system – every `process()` call generates a UUID request ID.
 *   Responses are matched by ID; stale responses from superseded requests are
 *   silently discarded.
 * • Progress callbacks – PROGRESS messages emitted by the worker update
 *   `progress` (0–100) so a determinate progress bar can be rendered.
 * • Cancellation – calling `cancel()` sends a CANCEL message to the worker and
 *   discards the pending request ID so the response is dropped even if the
 *   worker is mid-flight.
 * • SSR safety – the Worker constructor is called lazily inside a useEffect so
 *   it never runs during server-side rendering.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  WorkerInbound,
  WorkerOutbound,
  ProcessPayload,
  ProcessResult,
} from "@/src/workers/analyticsDataProcessor.worker";
import type { FarmRow, SortState, FilterGroup } from "@/src/types/farm";
import type { AggregateOptions } from "@/src/utils/dataPipeline";

// ─── Public interface ─────────────────────────────────────────────────────

export interface UseAnalyticsDataOptions {
  /** Called each time the worker emits a PROGRESS event (0–100). */
  onProgress?: (percent: number) => void;
}

export interface UseAnalyticsDataResult {
  /** Processed rows from the last completed RESULT response */
  rows: FarmRow[];
  /** Aggregation result from the last completed RESULT response (if requested) */
  aggregated: ProcessResult["aggregated"];
  /** True while a PROCESS request is in-flight */
  isProcessing: boolean;
  /** Progress percentage (0–100) of the current in-flight request */
  progress: number;
  /** Error message from the last failed request, null otherwise */
  error: string | null;
  /** Duration of the last completed processing run in ms */
  durationMs: number | null;
  /** Submit a new processing request */
  process: (args: ProcessArgs) => void;
  /** Cancel the current in-flight request */
  cancel: () => void;
}

export interface ProcessArgs {
  data: FarmRow[];
  sort?: SortState[];
  filter?: FilterGroup;
  aggregate?: AggregateOptions;
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useAnalyticsData(
  options: UseAnalyticsDataOptions = {}
): UseAnalyticsDataResult {
  const { onProgress } = options;

  // ── State ────────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<FarmRow[]>([]);
  const [aggregated, setAggregated] = useState<ProcessResult["aggregated"]>(undefined);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  // ── Refs ─────────────────────────────────────────────────────────────────
  /**
   * The Web Worker instance.  Created lazily in a useEffect so it never
   * runs during SSR.
   */
  const workerRef = useRef<Worker | null>(null);

  /**
   * The request ID of the most recently dispatched PROCESS message.
   * Any response carrying a different ID is treated as stale and dropped.
   */
  const currentRequestIdRef = useRef<string | null>(null);

  // Stable ref for the onProgress callback to avoid recreating the message
  // handler every time the caller's closure changes.
  const onProgressRef = useRef(onProgress);
  useEffect(() => {
    onProgressRef.current = onProgress;
  });

  // ── Worker lifecycle ─────────────────────────────────────────────────────
  useEffect(() => {
    // Dynamically construct the Worker so Next.js / bundler can handle the
    // module-worker URL.  The `{ type: 'module' }` option is required because
    // the worker uses ES-module imports.
    const worker = new Worker(
      new URL(
        "../workers/analyticsDataProcessor.worker.ts",
        import.meta.url
      ),
      { type: "module" }
    );

    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerOutbound>) => {
      const msg = event.data;

      // Discard stale responses from superseded requests.
      if (msg.requestId !== currentRequestIdRef.current) return;

      switch (msg.type) {
        case "PROGRESS": {
          const pct = msg.percent;
          setProgress(pct);
          onProgressRef.current?.(pct);
          break;
        }

        case "RESULT": {
          setRows(msg.result.rows);
          setAggregated(msg.result.aggregated);
          setDurationMs(msg.result.durationMs);
          setIsProcessing(false);
          setProgress(100);
          setError(null);
          currentRequestIdRef.current = null;
          break;
        }

        case "ERROR": {
          setError(msg.error);
          setIsProcessing(false);
          setProgress(0);
          currentRequestIdRef.current = null;
          break;
        }
      }
    };

    worker.onerror = (ev: ErrorEvent) => {
      setError(ev.message ?? "Worker error");
      setIsProcessing(false);
      setProgress(0);
      currentRequestIdRef.current = null;
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []); // run once on mount

  // ── process() ────────────────────────────────────────────────────────────
  const process = useCallback((args: ProcessArgs) => {
    const worker = workerRef.current;
    if (!worker) return;

    // Cancel any prior in-flight request before dispatching a new one.
    if (currentRequestIdRef.current) {
      const cancelMsg: WorkerInbound = {
        type: "CANCEL",
        requestId: currentRequestIdRef.current,
      };
      worker.postMessage(cancelMsg);
    }

    const requestId = generateRequestId();
    currentRequestIdRef.current = requestId;

    setIsProcessing(true);
    setProgress(0);
    setError(null);

    const payload: ProcessPayload = {
      data: args.data,
      operations: {
        filter: args.filter,
        sort: args.sort,
        aggregate: args.aggregate,
      },
    };

    const processMsg: WorkerInbound = { type: "PROCESS", requestId, payload };
    worker.postMessage(processMsg);
  }, []); // stable – no deps change after mount

  // ── cancel() ─────────────────────────────────────────────────────────────
  const cancel = useCallback(() => {
    const worker = workerRef.current;
    const id = currentRequestIdRef.current;
    if (!worker || !id) return;

    const cancelMsg: WorkerInbound = { type: "CANCEL", requestId: id };
    worker.postMessage(cancelMsg);

    // Drop the pending request ID immediately so any late response is discarded.
    currentRequestIdRef.current = null;
    setIsProcessing(false);
    setProgress(0);
  }, []);

  return {
    rows,
    aggregated,
    isProcessing,
    progress,
    error,
    durationMs,
    process,
    cancel,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateRequestId(): string {
  // Use crypto.randomUUID when available (browsers, Node ≥ 19), otherwise
  // fall back to a timestamp-based id which is good enough for uniqueness
  // within a single session.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
