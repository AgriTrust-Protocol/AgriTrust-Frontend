"use client";

import { useEffect, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { WalletProvider } from "@/components/providers/WalletContext";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { LocaleProvider } from "@/src/hooks/useLocale";
import { preloadCircuits } from "@/src/services/zkp/bootstrap";
import { registerServiceWorker } from "@/src/services/swRegistration";
import { WebVitalsReporter } from "@/lib/webVitals";
import { TracingProvider } from "@/src/services/observability/TracingProvider";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Warm the ZKP circuit cache so field verifications can run offline.
    void preloadCircuits();
    // Register the SW that drives lifecycle-aware certification caching.
    void registerServiceWorker();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <WebVitalsReporter />
      <TracingProvider />
      <LocaleProvider>
        <WalletProvider>
          <AuthProvider>{children}</AuthProvider>
        </WalletProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );
}
