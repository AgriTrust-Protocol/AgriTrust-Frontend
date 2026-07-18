"use client";

import dynamic from "next/dynamic";
import { InternationalizedText } from "@/src/components/common/InternationalizedText";
import { FeatureGate } from "@/src/components/resilience/ResilienceProvider";

const FarmMap = dynamic(
  () => import("./_components/FarmMap").then((m) => ({ default: m.FarmMap })),
  { ssr: false, loading: () => <div className="h-[460px] animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-700" /> },
);

const YieldHeatmap = dynamic(
  () => import("./_components/YieldHeatmap").then((m) => ({ default: m.YieldHeatmap })),
  { ssr: false, loading: () => <div className="h-[460px] animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-700" /> },
);

export default function MapsPage() {
  return (
    <FeatureGate
      feature="maps"
      fallback={<p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">Maps are temporarily unavailable while capacity is protected.</p>}
    >
      <div className="space-y-6">
        <InternationalizedText as="h1" id="maps.title" className="text-2xl font-bold" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <FarmMap />
          <YieldHeatmap />
        </div>
      </div>
    </FeatureGate>
  );
}
