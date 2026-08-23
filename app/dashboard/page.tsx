"use client";
import { InternationalizedText } from "@/src/components/common/InternationalizedText";
import { WeatherPlanner } from "@/src/components/dashboard/WeatherPlanner";
import { CertificateActions } from "@/src/components/dashboard/CertificateActions";
import { FeatureGate } from "@/src/components/resilience/ResilienceProvider";
import dynamic from "next/dynamic";
// import { use } from "react";

const YieldDashboard = dynamic(
  () =>
    import("@/src/components/dashboard/YieldDashboard").then(
      (m) => ({ default: m.YieldDashboard }),
    ),
  { ssr: false },
);

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <InternationalizedText
        as="h1"
        id="dashboard.overview.title"
        className="text-2xl font-bold"
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
          <InternationalizedText
            as="p"
            id="dashboard.totalFunds"
            className="text-sm text-zinc-500"
          />
          <p className="text-3xl font-bold">--</p>
        </div>
        <div className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
          <InternationalizedText
            as="p"
            id="dashboard.activeProjects"
            className="text-sm text-zinc-500"
          />
          <p className="text-3xl font-bold">--</p>
        </div>
        <div className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
          <InternationalizedText
            as="p"
            id="dashboard.pendingTransactions"
            className="text-sm text-zinc-500"
          />
          <p className="text-3xl font-bold">--</p>
        </div>
      </div>
      <WeatherPlanner />
      <CertificateActions />
      <FeatureGate feature="analytics">
        <YieldDashboard />
      </FeatureGate>
    </div>
  );
}
