"use client";

/**
 * Live cargo telemetry view.
 *
 * Frames stream in over WebSocket at up to ~200/sec; the time-batched
 * buffer in `useWebSocketTelemetry` applies them to React state only
 * once per 450ms flush, so this component re-renders at ~2/sec instead
 * of ~200/sec. Data transformation is memoized on the batch timestamp so
 * per-frame work is never repeated, and the chart child is `React.memo`.
 *
 * In development an overlay shows renders/sec and dropped frames and
 * asserts the render budget (<3 renders/sec) is respected.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useWebSocketTelemetry } from "@/src/hooks/useWebSocketTelemetry";
import {
  TelemetryChart,
  type TelemetrySeries,
} from "@/src/components/charts/TelemetryChart";
import type { TelemetryPoint } from "@/src/utils/telemetryBuffer";

/** Sliding window of data points displayed per metric. */
const WINDOW_POINTS = 300;

export interface LiveTelemetryProps {
  /** WebSocket endpoint streaming telemetry frames. */
  url: string;
}

export function LiveTelemetry({ url }: LiveTelemetryProps) {
  const { status, points, droppedFrames } = useWebSocketTelemetry({ url });

  // Rebuild series once per applied batch (each flush produces a fresh
  // `points` snapshot), trimming to the last WINDOW_POINTS samples.
  const series = useMemo<TelemetrySeries[]>(
    () => buildSeries(points, WINDOW_POINTS),
    [points],
  );

  // Dev-only render budget instrumentation. The ref is only touched in
  // effects (never during render) per the react-hooks/refs contract.
  const renderCountRef = useRef(0);
  useEffect(() => {
    renderCountRef.current += 1;
  });

  const [rendersPerSecond, setRendersPerSecond] = useState(0);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const interval = setInterval(() => {
      const count = renderCountRef.current;
      renderCountRef.current = 0;
      setRendersPerSecond(count);
      // Budget: at most 3 renders/sec under normal operation.
      console.assert(
        count <= 3,
        `[LiveTelemetry] renders/sec ${count} exceeded budget of 3`,
      );
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Live Cargo Telemetry
        </h2>
        <span
          data-testid="telemetry-status"
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
            status === "live"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              : status === "error" || status === "closed"
                ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
          }`}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
          {status}
        </span>
      </div>

      <TelemetryChart series={series} />

      {process.env.NODE_ENV === "development" && (
        <div
          data-testid="telemetry-perf-overlay"
          className="rounded-lg border border-dashed border-amber-400 bg-amber-50 px-3 py-2 font-mono text-[11px] text-amber-700 dark:border-amber-500/50 dark:bg-amber-950/30 dark:text-amber-300"
        >
          Renders/sec: {rendersPerSecond} | Dropped frames: {droppedFrames}
        </div>
      )}
    </section>
  );
}

function buildSeries(
  points: readonly TelemetryPoint[],
  windowPoints: number,
): TelemetrySeries[] {
  const byMetric = new Map<string, number[]>();
  for (const point of points) {
    let values = byMetric.get(point.metric);
    if (!values) {
      values = [];
      byMetric.set(point.metric, values);
    }
    values.push(point.value);
  }
  const series: TelemetrySeries[] = [];
  for (const [metric, values] of byMetric) {
    if (values.length > windowPoints) values.splice(0, values.length - windowPoints);
    series.push({ metric, values });
  }
  return series;
}
