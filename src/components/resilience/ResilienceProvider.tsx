"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { classifyCapacity, getConfiguredCapacityLevel, isFeatureShed, type CapacityLevel, type CapacitySignal } from "@/src/lib/resilience/capacityShedder";
import { getFeatureFlags, type FeatureFlag, type FeatureFlags } from "@/src/lib/resilience/featureFlags";

type ResilienceContextValue = {
  capacityLevel: CapacityLevel;
  isEnabled: (feature: FeatureFlag) => boolean;
};

const ResilienceContext = createContext<ResilienceContextValue | null>(null);

/**
 * The capacity signal is supplied by the deployment/runtime control plane. It
 * is intentionally optional so an unavailable control plane fails open for
 * existing users; server-side admission controls remain authoritative.
 */
export function ResilienceProvider({ children, flags = getFeatureFlags(), signal }: {
  children: ReactNode;
  flags?: FeatureFlags;
  signal?: CapacitySignal;
}) {
  const value = useMemo<ResilienceContextValue>(() => {
    const capacityLevel = signal ? classifyCapacity(signal) : getConfiguredCapacityLevel();
    return {
      capacityLevel,
      isEnabled: (feature) => flags[feature] && !isFeatureShed(feature, capacityLevel),
    };
  }, [flags, signal]);

  return <ResilienceContext.Provider value={value}>{children}</ResilienceContext.Provider>;
}

export function useResilience(): ResilienceContextValue {
  const context = useContext(ResilienceContext);
  if (!context) throw new Error("useResilience must be used inside ResilienceProvider");
  return context;
}

export function FeatureGate({ feature, children, fallback = null }: {
  feature: FeatureFlag;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return useResilience().isEnabled(feature) ? <>{children}</> : <>{fallback}</>;
}
