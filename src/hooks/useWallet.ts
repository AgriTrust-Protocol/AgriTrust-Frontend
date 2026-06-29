/**
 * Wallet hook with cross-tab state synchronization.
 *
 * Re-exports the core wallet context and layers on BroadcastChannel-based
 * sync so all open tabs stay coherent.  Prefer importing from this module
 * rather than directly from WalletContext when cross-tab sync is desired.
 */

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useWallet as useWalletContext } from "@/components/providers/WalletContext";
import { defaultWalletStore } from "@/src/stores/walletStore";
import { useTabSync } from "@/src/hooks/useTabSync";
import type { WalletSyncPayload } from "@/src/types/sync";

type WalletProvider = "metamask" | "walletconnect" | "freighter" | null;
type WalletStatus = "connected" | "disconnected" | "connecting" | "approving" | "reconnecting" | "signing" | "ready";

export interface UseWalletSyncReturn {
  account: string | null;
  status: WalletStatus;
  chainId: string | null;
  isSwitching: boolean;
  provider: WalletProvider;
  connect: (p?: WalletProvider) => Promise<void>;
  disconnect: () => void;
  /** Number of active tabs sharing this wallet session. */
  activeTabs: number;
}

function toSyncPayload(account: string | null): WalletSyncPayload {
  return {
    account,
    chainId: null,
    status: account ? "ready" : "disconnected",
  };
}

export function useWallet(): UseWalletSyncReturn {
  const ctx = useWalletContext();
  const tabSync = useTabSync();
  const prevAccountRef = useRef<string | null>(ctx.account);

  // Keep the shared store in sync with local context changes
  useEffect(() => {
    const payload = toSyncPayload(ctx.account);
    defaultWalletStore.setState(payload);

    // Broadcast to other tabs when local state changes
    if (tabSync && ctx.account !== prevAccountRef.current) {
      tabSync.broadcast(payload);
    }
    prevAccountRef.current = ctx.account;
  }, [ctx.account, ctx.provider, tabSync]);

  // Subscribe to remote state updates from the wallet store
  const remoteState = useSyncExternalStore(
    defaultWalletStore.subscribe,
    defaultWalletStore.getSnapshot,
    defaultWalletStore.getServerSnapshot,
  );

  // Determine the effective account and status: prefer remote if it's newer than local
  const localTimestamp = defaultWalletStore.getSnapshot().lastUpdated;
  const isRemoteNewer = remoteState.lastUpdated > localTimestamp;

  const effectiveAccount = isRemoteNewer ? remoteState.account : ctx.account;
  const effectiveStatus = isRemoteNewer ? remoteState.status : ctx.status;

  const activeTabs = tabSync ? tabSync.getActiveTabs().length : 1;

  return {
    account: effectiveAccount,
    status: ctx.isSwitching ? "reconnecting" : remoteState.status || ctx.status,
    chainId: remoteState.chainId,
    isSwitching: ctx.isSwitching,
    provider: ctx.provider,
    connect: ctx.connect,
    disconnect: ctx.disconnect,
    activeTabs,
  };
}
