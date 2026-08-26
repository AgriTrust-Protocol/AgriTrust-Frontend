"use client";

/**
 * useSorobanEscrow.ts
 *
 * React Query mutation hook for Soroban escrow operations (deposit, release,
 * dispute).  All failures are automatically passed through decodeError() so
 * callers receive a user-friendly TranslatedError rather than raw RPC output.
 *
 * Usage:
 *   const { deposit, release, dispute, translatedError, clearError } = useSorobanEscrow();
 *   deposit.mutate({ contractId, amount, counterparty });
 *
 *   if (translatedError) return <ErrorToast translated={translatedError} onDismiss={clearError} />;
 */

import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { decodeError, DecodedError, type TranslatedError } from "@/src/utils/errorDecoder";

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface DepositParams {
  /** Soroban contract ID (C…) */
  contractId: string;
  /** Token amount in stroops (integer string). */
  amount: string;
  /** Stellar address of the escrow counterparty. */
  counterparty: string;
}

export interface ReleaseParams {
  /** Soroban contract ID (C…) */
  contractId: string;
  /** Optional release memo or inspection reference. */
  memo?: string;
}

export interface DisputeParams {
  /** Soroban contract ID (C…) */
  contractId: string;
  /** Reason for raising the dispute. */
  reason: string;
}

export interface EscrowResult {
  hash: string;
  status: "pending" | "success" | "failed";
  ledger?: number;
}

// ─── Thin RPC layer (replace with real Soroban SDK calls) ────────────────────

async function rpcDeposit(params: DepositParams): Promise<EscrowResult> {
  // Dynamic import keeps the Soroban SDK out of the initial bundle
  const { Client, SorobanRpc } = await import("@/services/sorobanClient");
  const client = new Client();
  const rpc = new SorobanRpc();

  // Build a minimal XDR representation for the deposit invocation.
  // In production, swap this for real Stellar SDK transaction assembly.
  const xdr = `deposit:${params.contractId}:${params.amount}:${params.counterparty}`;
  const result = await client.submitTransaction(xdr, rpc);
  return { hash: result.hash, status: result.status as EscrowResult["status"] };
}

async function rpcRelease(params: ReleaseParams): Promise<EscrowResult> {
  const { Client, SorobanRpc } = await import("@/services/sorobanClient");
  const client = new Client();
  const rpc = new SorobanRpc();

  const xdr = `release:${params.contractId}:${params.memo ?? ""}`;
  const result = await client.submitTransaction(xdr, rpc);
  return { hash: result.hash, status: result.status as EscrowResult["status"] };
}

async function rpcDispute(params: DisputeParams): Promise<EscrowResult> {
  const { Client, SorobanRpc } = await import("@/services/sorobanClient");
  const client = new Client();
  const rpc = new SorobanRpc();

  const xdr = `dispute:${params.contractId}:${encodeURIComponent(params.reason)}`;
  const result = await client.submitTransaction(xdr, rpc);
  return { hash: result.hash, status: result.status as EscrowResult["status"] };
}

// ─── Error wrapper helper ─────────────────────────────────────────────────────

/**
 * Wraps an async RPC call so that any thrown error is re-raised as a
 * DecodedError with a user-friendly translation attached.
 */
async function withDecoding<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const base = err instanceof Error ? err : new Error(String(err));
    throw new DecodedError(base);
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseSorobanEscrowReturn {
  /** Mutation for depositing funds into an escrow contract. */
  deposit: UseMutationResult<EscrowResult, DecodedError, DepositParams>;
  /** Mutation for releasing escrowed funds to the counterparty. */
  release: UseMutationResult<EscrowResult, DecodedError, ReleaseParams>;
  /** Mutation for raising a dispute on an escrow contract. */
  dispute: UseMutationResult<EscrowResult, DecodedError, DisputeParams>;
  /**
   * The most recent translated error from any of the three mutations.
   * Cleared automatically when a new mutation starts, or manually via
   * clearError().
   */
  translatedError: TranslatedError | null;
  /** Clears translatedError without triggering a mutation reset. */
  clearError: () => void;
  /** True while any of the three mutations is in the pending state. */
  isPending: boolean;
}

export function useSorobanEscrow(): UseSorobanEscrowReturn {
  const [translatedError, setTranslatedError] = useState<TranslatedError | null>(null);

  const clearError = useCallback(() => setTranslatedError(null), []);

  // ── Shared mutation options ───────────────────────────────────────────────

  const sharedOptions = {
    onMutate: () => {
      // Clear any stale error when a new attempt starts
      setTranslatedError(null);
    },
    onError: (err: DecodedError) => {
      // DecodedError carries a pre-translated message; fall back gracefully
      if (err instanceof DecodedError) {
        setTranslatedError(err.translated);
      } else {
        // Should not reach here given withDecoding(), but guard defensively
        setTranslatedError(decodeError(err));
      }
    },
  };

  // ── Deposit ───────────────────────────────────────────────────────────────

  const deposit = useMutation<EscrowResult, DecodedError, DepositParams>({
    mutationFn: (params) => withDecoding(() => rpcDeposit(params)),
    ...sharedOptions,
  });

  // ── Release ───────────────────────────────────────────────────────────────

  const release = useMutation<EscrowResult, DecodedError, ReleaseParams>({
    mutationFn: (params) => withDecoding(() => rpcRelease(params)),
    ...sharedOptions,
  });

  // ── Dispute ───────────────────────────────────────────────────────────────

  const dispute = useMutation<EscrowResult, DecodedError, DisputeParams>({
    mutationFn: (params) => withDecoding(() => rpcDispute(params)),
    ...sharedOptions,
  });

  return {
    deposit,
    release,
    dispute,
    translatedError,
    clearError,
    isPending: deposit.isPending || release.isPending || dispute.isPending,
  };
}
