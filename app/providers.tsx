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
import { ResilienceProvider, useResilience } from "@/src/components/resilience/ResilienceProvider";
import { ThemeProvider } from "@/src/components/providers/ThemeProvider";
import { TracingProvider } from "@/src/services/observability/TracingProvider";

function ResilienceBootstrap({ children }: { children: ReactNode }) {
  const { isEnabled } = useResilience();

  useEffect(() => {
    // These non-critical warmups are the first work removed under load.
    if (isEnabled("zkpCircuitPreload")) void preloadCircuits();
    if (isEnabled("serviceWorker")) void registerServiceWorker();
  }, [isEnabled]);

  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WebVitalsReporter />
      <TracingProvider />
      <ThemeProvider>
        <LocaleProvider>
          <WalletProvider>
            <AuthProvider>
              <ResilienceProvider>
                <ResilienceBootstrap>{children}</ResilienceBootstrap>
              </ResilienceProvider>
            </AuthProvider>
          </WalletProvider>
        </LocaleProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
