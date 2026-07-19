import { createTraceContext, flushTracing } from "@/src/services/observability/tracing";

type AttributeValue = string | number | boolean;

export interface OfflineSpanEvent {
  name: string;
  startTime: number;
  endTime: number;
  attributes: Record<string, AttributeValue>;
}

const pendingOfflineSpans: OfflineSpanEvent[] = [];

export function recordOfflineSpan(
  name: string,
  attributes: Record<string, AttributeValue>,
  startTime: number = Date.now()
): void {
  const context = typeof crypto !== "undefined"
    ? createTraceContext()
    : undefined;
  pendingOfflineSpans.push({
    name,
    startTime,
    endTime: Date.now(),
    attributes: {
      ...attributes,
      "otel.scope.name": "agritrust.offline",
      ...(context ? { "trace.id": context.traceId, "span.id": context.spanId } : {}),
    },
  });
  flushTracing();
}

export function getOfflineSpanBuffer(): OfflineSpanEvent[] {
  return [...pendingOfflineSpans];
}

export function clearOfflineSpanBuffer(): void {
  pendingOfflineSpans.length = 0;
}
