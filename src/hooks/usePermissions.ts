"use client";

/**
 * Hook exposing the current user's resolved permissions.
 *
 * Combines the connected wallet account with the role reported by the
 * certification smart contract (via `roleStore`) and exposes a
 * synchronous `can(resource, action)` predicate backed by the static
 * policy matrix in `src/config/permissions.ts` — including wildcard
 * expansion and inheritance-chain traversal.
 *
 * Role updates propagate through `useSyncExternalStore`, so every active
 * `PermissionGate` re-renders within one React commit (<100ms) of a
 * wallet role change.
 */

import { useCallback, useSyncExternalStore } from "react";
import { can as evaluatePolicy } from "@/src/config/permissions";
import { defaultRoleStore } from "@/src/stores/roleStore";
import { useWallet } from "@/src/hooks/useWallet";
import type { Action, Resource, Role } from "@/src/types/auth";

export interface UsePermissionsReturn {
  /** Effective role for the connected wallet (`null` when disconnected). */
  role: Role | null;
  /**
   * Whether the current role may perform `action` on `resource`.
   * Synchronous lookup; completes in well under 1ms.
   */
  can: (resource: Resource, action: Action) => boolean;
}

export function usePermissions(): UsePermissionsReturn {
  const { account } = useWallet();
  const storeState = useSyncExternalStore(
    defaultRoleStore.subscribe,
    defaultRoleStore.getSnapshot,
    defaultRoleStore.getServerSnapshot,
  );

  // An explicit on-chain role wins; otherwise a connected wallet gets
  // least-privilege VIEWER access and an anonymous session gets none.
  const hasOverride = storeState.account !== null && storeState.account === account;
  const role: Role | null = hasOverride
    ? storeState.role
    : account
      ? "VIEWER"
      : null;

  const can = useCallback(
    (resource: Resource, action: Action) => evaluatePolicy(role, resource, action),
    [role],
  );

  return { role, can };
}
