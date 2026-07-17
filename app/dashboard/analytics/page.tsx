"use client";

import dynamic from "next/dynamic";
import { InternationalizedText } from "@/src/components/common/InternationalizedText";
import { FeatureGate } from "@/src/components/resilience/ResilienceProvider";

const TelemetryChart = dynamic(
  () => import("./_components/TelemetryChart").then((m) => ({ default: m.TelemetryChart })),
  { ssr: false, loading: () => <div className="h-[380px] animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-700" /> },
);

const YieldHistogram = dynamic(
  () => import("./_components/YieldHistogram").then((m) => ({ default: m.YieldHistogram })),
  { ssr: false, loading: () => <div className="h-[380px] animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-700" /> },
);

export default function AnalyticsPage() {
  return (
    <FeatureGate
      feature="analytics"
      fallback={<p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">Analytics is temporarily unavailable while capacity is protected.</p>}
    >
      <div className="space-y-6">
        <InternationalizedText as="h1" id="analytics.title" className="text-2xl font-bold" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <TelemetryChart />
          <YieldHistogram />
        </div>
      </div>
    </FeatureGate>
  );
}
