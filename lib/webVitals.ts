"use client";

import { useReportWebVitals } from "next/web-vitals";
import { getLogger } from "@/src/observability/logger";

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV !== "production") return;

    getLogger().info("Web vital reported", {
      "webvital.name": metric.name,
      "webvital.value": metric.value,
      "webvital.rating": metric.rating,
      "webvital.delta": metric.delta,
      "webvital.id": metric.id,
    });
  });

  return null;
}
