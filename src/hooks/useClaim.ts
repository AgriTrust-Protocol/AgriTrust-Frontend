"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { notifyClaimStatusChange, notifyPayout } from "@/src/services/notificationService";
import { buildSubmittedClaim } from "@/src/services/claimsWorkflow";
import { type ClaimDraft, type ClaimMessage, type InsuranceClaim } from "@/src/components/claims/claimTypes";

const claimsKey = ["claims"] as const;

export function useClaim(claimId?: string) {
  const queryClient = useQueryClient();
  const [localClaims, setLocalClaims] = useState<InsuranceClaim[]>([]);
  const claimsQuery = useQuery({ queryKey: claimsKey, queryFn: () => apiClient.get<InsuranceClaim[]>("/api/v1/claims"), staleTime: 30_000, retry: 1 });
  const claims = claimsQuery.data?.length ? claimsQuery.data : localClaims;
  const claim = useMemo(() => claims.find((item) => item.id === claimId) ?? claims[0], [claimId, claims]);

  const submitClaim = useMutation({
    mutationFn: async (draft: ClaimDraft) => {
      const created = buildSubmittedClaim(draft);
      return apiClient.post<InsuranceClaim>("/api/v1/claims", created).catch(() => created);
    },
    onSuccess: async (created) => {
      setLocalClaims((current) => [created, ...current]);
      queryClient.setQueryData<InsuranceClaim[]>(claimsKey, (current = []) => [created, ...current]);
      await notifyClaimStatusChange({ claimId: created.id, status: created.status, payoutCents: created.payoutCents });
      if (created.status === "paid") await notifyPayout({ claimId: created.id, status: created.status, payoutCents: created.payoutCents });
    },
  });

  return { ...claimsQuery, claims, claim, submitClaim };
}

export function persistClaimMessage(claimId: string, message: ClaimMessage) {
  return apiClient.post<ClaimMessage>(`/api/v1/claims/${claimId}/messages`, message).catch(() => message);
}
