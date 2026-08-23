/**
 * Lightweight external store mapping wallet accounts to on-chain roles,
 * following the same `useSyncExternalStore` contract as `walletStore`.
 *
 * The certification smart contract emits a role event whenever access is
 * granted or revoked; the WebSocket handler feeds that event into
 * `setWalletRole`, which synchronously notifies every subscriber so all
 * active permission gates re-render well inside the 100ms budget.
 */

import type { Role } from "@/src/types/auth";

export interface RoleStoreState {
  account: string | null;
  role: Role | null;
  /** Wall-clock timestamp of the last state mutation. */
  lastUpdated: number;
}

export interface RoleStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): RoleStoreState;
  getServerSnapshot(): RoleStoreState;
  /** Apply a role update originating from the wallet / contract. */
  setWalletRole(account: string | null, role: Role | null): void;
  reset(): void;
}

const EMPTY: RoleStoreState = Object.freeze({
  account: null,
  role: null,
  lastUpdated: 0,
});

export function createRoleStore(): RoleStore {
  const listeners = new Set<() => void>();
  let state: RoleStoreState = { ...EMPTY };

  function emit(): void {
    for (const l of listeners) l();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot() {
      return state;
    },

    getServerSnapshot() {
      return EMPTY;
    },

    setWalletRole(account, role) {
      state = { account, role, lastUpdated: Date.now() };
      emit();
    },

    reset() {
      state = { ...EMPTY };
      emit();
    },
  };
}

/** Shared singleton consumed by the `usePermissions` hook. */
export const defaultRoleStore = createRoleStore();
