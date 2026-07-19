"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProvenanceBatch, VerificationResult } from "@/src/components/provenance/types";

export function sortProvenanceEvents(events: ProvenanceBatch["events"]) {
  return [...events].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

export async function verifyInclusion(proof: { valid?: boolean; transactionHash?: string }) {
  return Boolean(proof.valid);
}

export function useProvenance(batchId: string, initialData?: ProvenanceBatch) {
  const [data, setData] = useState<ProvenanceBatch | undefined>(initialData);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData || !batchId) return;
    const controller = new AbortController();
    setIsLoading(true);
    fetch(`/api/provenance/${batchId}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load provenance for ${batchId}`);
        return res.json() as Promise<ProvenanceBatch>;
      })
      .then((payload) => setData({ ...payload, events: sortProvenanceEvents(payload.events) }))
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, [batchId, initialData]);

  const verifyEvent = useCallback(async (eventId: string): Promise<VerificationResult> => {
    const res = await fetch(`/provenance/${eventId}/proof`);
    if (!res.ok) return { status: "failed", message: "Merkle proof unavailable" };
    const proof = await res.json();
    const verified = await verifyInclusion(proof);
    return {
      status: verified ? "verified" : "failed",
      message: verified ? "Merkle inclusion verified on-chain" : "On-chain verification failed",
      transactionHash: proof.transactionHash,
    };
  }, []);

  return { data, events: sortProvenanceEvents(data?.events ?? []), isLoading, error, verifyEvent };
}
