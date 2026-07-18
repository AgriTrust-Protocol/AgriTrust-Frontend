"use client";

import { useResilience } from "./ResilienceProvider";

export function CapacityNotice() {
  const { capacityLevel } = useResilience();
  if (capacityLevel === "normal") return null;

  return (
    <div role="status" aria-live="polite" className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">
      {capacityLevel === "critical"
        ? "High demand: optional maps and analytics are temporarily unavailable while core actions remain available."
        : "High demand: background enhancements are temporarily reduced to keep core actions responsive."}
    </div>
  );
}
