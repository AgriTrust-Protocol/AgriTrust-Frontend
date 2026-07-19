"use client";

import { useState } from "react";
import type { VerificationResult } from "./types";

interface VerificationBadgeProps {
  eventId: string;
  onVerify: (eventId: string) => Promise<VerificationResult>;
}

const label = {
  idle: "Verify on-chain",
  loading: "Verifying…",
  verified: "✓ Verified",
  failed: "Verification failed",
};

export function VerificationBadge({ eventId, onVerify }: VerificationBadgeProps) {
  const [result, setResult] = useState<VerificationResult>({ status: "idle" });

  async function handleVerify() {
    setResult({ status: "loading" });
    try {
      setResult(await onVerify(eventId));
    } catch (error) {
      setResult({ status: "failed", message: error instanceof Error ? error.message : "Unable to verify proof" });
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={handleVerify}
        disabled={result.status === "loading"}
        className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 disabled:opacity-60"
        aria-live="polite"
      >
        {label[result.status]}
      </button>
      {result.message && <p className="text-xs text-zinc-500">{result.message}</p>}
      {result.transactionHash && <p className="font-mono text-[11px] text-zinc-400">{result.transactionHash}</p>}
    </div>
  );
}
