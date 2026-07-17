import { type ReactNode } from "react";
import { LoadingBoundary } from "@/components/loading/LoadingBoundary";
import { DashboardWalletBoundary } from "@/src/components/wallet/DashboardWalletBoundary";
import { InternationalizedText } from "@/src/components/common/InternationalizedText";
import { LocaleSwitcher } from "@/src/components/common/LocaleSwitcher";
import { FeatureGate } from "@/src/components/resilience/ResilienceProvider";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <InternationalizedText
            as="span"
            id="nav.brand"
            className="text-lg font-semibold"
          />
          <div className="flex items-center gap-4 text-sm">
            <a
              href="/dashboard"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <InternationalizedText id="nav.overview" />
            </a>
            <FeatureGate feature="analytics">
              <a
              href="/dashboard/analytics"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <InternationalizedText id="nav.analytics" />
              </a>
            </FeatureGate>
            <FeatureGate feature="maps">
              <a
              href="/dashboard/maps"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <InternationalizedText id="nav.maps" />
              </a>
            </FeatureGate>
            <a
              href="/dashboard/operations"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Operations
            </a>
            <a
              href="/dashboard/planner"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Field planner
            </a>
            <a
              href="/wallet"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <InternationalizedText id="nav.wallet" />
            </a>
            <a
              href="/settings/devices"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <InternationalizedText id="nav.devices" />
            </a>
            <LocaleSwitcher />
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <LoadingBoundary>
          <DashboardWalletBoundary>{children}</DashboardWalletBoundary>
        </LoadingBoundary>
      </main>
    </div>
  );
}
