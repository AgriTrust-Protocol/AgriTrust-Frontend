// src/hooks/useTxRetryQueue.ts
import { useCallback, useEffect, useRef, useState } from "react";
import * as txStateStore from "../services/txStateStore";
import type { TxEntry } from "../services/txStateStore";

const RECOVERY_BUDGET_MS = 5000;
const STATUS_ENDPOINT = "/api/v1/blockchain/tx-status";

export interface RecoveredTx extends TxEntry {
  /** true once this entry's on-chain status has been checked (or timed out) */
  reconciled: boolean;
  /** set when the status check couldn't complete within the recovery budget */
  timedOut?: boolean;
}

export interface ToastEvent {
  kind: "success" | "warning" | "error";
  message: string;
  operationId: string;
}

interface UseTxRetryQueueResult {
  recovered: RecoveredTx[];
  loading: boolean;
  toasts: ToastEvent[];
  dismissToast: (operationId: string) => void;
  retry: (operationId: string) => Promise<void>;
  dismiss: (operationId: string) => void;
}

async function fetchStatus(
  txHash: string,
  signal: AbortSignal
): Promise<"confirmed" | "failed" | "unknown"> {
  try {
    const res = await fetch(`${STATUS_ENDPOINT}?hash=${encodeURIComponent(txHash)}`, {
      signal,
    });
    if (!res.ok) return "unknown";
    const data = await res.json();
    if (data.status === "confirmed") return "confirmed";
    if (data.status === "failed" || data.status === "not_found") return "failed";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * On mount:
 *  1. Reads any `preparing`-with-no-hash entries and auto-cancels them (the
 *     user refreshed before the wallet ever returned a hash — nothing to
 *     recover, nothing was broadcast).
 *  2. Reads `broadcasting` / `pending_confirmation` entries and checks each
 *     against the chain, all within a hard `RECOVERY_BUDGET_MS` (5s) budget
 *     so app init never hangs waiting on a slow RPC.
 *  3. Surfaces results as toasts and a `recovered` list for the banner.
 */
export function useTxRetryQueue(): UseTxRetryQueueResult {
  const [recovered, setRecovered] = useState<RecoveredTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastEvent[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const pushToast = useCallback((toast: ToastEvent) => {
    setToasts((prev) => [...prev, toast]);
  }, []);

  const dismissToast = useCallback((operationId: string) => {
    setToasts((prev) => prev.filter((t) => t.operationId !== operationId));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;

    async function recover() {
      // Step 1: entries that never got signed — nothing was broadcast, so
      // just clear them with a reassuring toast.
      for (const entry of txStateStore.getUnsigned()) {
        txStateStore.remove(entry.operationId);
        if (!cancelled) {
          pushToast({
            kind: "warning",
            operationId: entry.operationId,
            message: "A transaction was interrupted before signing. No action needed.",
          });
        }
      }

      // Step 2: entries genuinely in flight need reconciling against chain state.
      const pending = txStateStore.getPending();
      if (pending.length === 0) {
        if (!cancelled) {
          setLoading(false);
          setRecovered([]);
        }
        return;
      }

      const budgetTimer = new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), RECOVERY_BUDGET_MS)
      );

      const results = await Promise.race([
        Promise.all(
          pending.map(async (entry): Promise<RecoveredTx> => {
            if (!entry.txHash) {
              return { ...entry, reconciled: true, status: "unknown" };
            }
            const status = await fetchStatus(entry.txHash, controller.signal);

            if (status === "confirmed") {
              txStateStore.update({ txHash: entry.txHash }, "confirmed");
              return { ...entry, status: "confirmed", reconciled: true };
            }
            if (status === "failed") {
              txStateStore.update({ txHash: entry.txHash }, "failed");
              return { ...entry, status: "failed", reconciled: true };
            }
            // Still unknown: leave the stored status as-is so the user gets
            // a retry option rather than a false "failed".
            return { ...entry, status: "unknown", reconciled: true };
          })
        ),
        budgetTimer,
      ]);

      if (cancelled) return;

      if (results === "timeout") {
        // Recovery budget exceeded: surface what we have as unreconciled
        // rather than blocking app init indefinitely.
        setRecovered(pending.map((e) => ({ ...e, reconciled: false, timedOut: true })));
        pushToast({
          kind: "warning",
          operationId: "__recovery_timeout",
          message: "Couldn't confirm all pending transactions in time — check them manually.",
        });
      } else {
        setRecovered(results);
        for (const r of results) {
          if (r.status === "confirmed") {
            pushToast({
              kind: "success",
              operationId: r.operationId,
              message: "A pending transaction was confirmed.",
            });
          } else if (r.status === "failed") {
            pushToast({
              kind: "error",
              operationId: r.operationId,
              message: "A pending transaction failed and can be retried.",
            });
          }
        }
      }

      setLoading(false);
    }

    recover();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [pushToast]);

  const retry = useCallback(async (operationId: string) => {
    const entry = txStateStore.getAll().find((e) => e.operationId === operationId);
    if (!entry || !entry.txHash) return;

    const status = await fetchStatus(entry.txHash, new AbortController().signal);
    if (status === "confirmed") {
      txStateStore.update({ operationId }, "confirmed");
      setRecovered((prev) =>
        prev.map((r) => (r.operationId === operationId ? { ...r, status: "confirmed" } : r))
      );
    }
  }, []);

  const dismiss = useCallback((operationId: string) => {
    txStateStore.remove(operationId);
    setRecovered((prev) => prev.filter((r) => r.operationId !== operationId));
  }, []);

  return { recovered, loading, toasts, dismissToast, retry, dismiss };
}
