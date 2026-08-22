// src/hooks/useFarmRole.ts
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import type { FarmRole } from "@/src/types/farm";

interface UseFarmRoleResult {
  role: FarmRole | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Resolves the current user's role for a given farm.
 * Backed by GET /api/farms/{farmId}/role, keyed off the authenticated wallet address.
 */
export function useFarmRole(farmId: string): UseFarmRoleResult {
  const { user, status } = useAuth();
  const [role, setRole] = useState<FarmRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchRole() {
      if (status !== "authenticated" || !user?.address || !farmId) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/farms/${encodeURIComponent(farmId)}/role`,
          { headers: { "x-wallet-address": user.address } }
        );
        if (!res.ok) {
          throw new Error(`Failed to resolve role (${res.status})`);
        }
        const data = (await res.json()) as { role: FarmRole };
        if (!cancelled) {
          setRole(data.role);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to resolve role");
          setRole(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchRole();
    return () => {
      cancelled = true;
    };
  }, [farmId, status, user?.address]);

  return { role, isLoading, error };
}
