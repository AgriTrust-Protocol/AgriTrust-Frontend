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
    const body: Record<string, unknown> = {
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      id: metric.id,
      path: window.location.pathname,
      timestamp: Date.now(),
    };

    if (metric.attribution) {
      body.attribution = metric.attribution;
    }

    const url = process.env.NEXT_PUBLIC_WEB_VITALS_ENDPOINT;
    if (url) {
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => {});
    }

    if (metric.name === "LCP") {
      console.log(`[WebVitals] LCP: ${metric.value}ms (${metric.rating})`);
    }
    if (metric.name === "TTFB") {
      console.log(`[WebVitals] TTFB: ${metric.value}ms (${metric.rating})`);
    }
  });

  return null;
}
