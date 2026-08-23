"use client";

/**
 * Declarative permission gate composing role-based access policies.
 *
 * Wraps arbitrary children and evaluates `can(resource, action)` from the
 * static policy matrix via `usePermissions`. Three fallback modes:
 *
 *  - `"hide"`     → renders nothing (default)
 *  - `"disable"`  → clones children with `disabled` + aria-disabled
 *  - `"redirect"` → navigates to `redirectTo` (default `/dashboard`)
 *
 * Children may alternatively be a render prop receiving `{ can, role }`
 * for bespoke UI decisions.
 */

import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { usePermissions } from "@/src/hooks/usePermissions";
import type { Action, Resource, Role } from "@/src/types/auth";

export type PermissionFallbackMode = "hide" | "disable" | "redirect";

export interface PermissionGateProps {
  /** Resource being accessed. */
  resource: Resource;
  /** Action attempted on the resource. */
  action: Action;
  /** How to handle a denied evaluation. Defaults to `"hide"`. */
  fallback?: PermissionFallbackMode;
  /** Destination used by the `"redirect"` mode. */
  redirectTo?: string;
  /**
   * Elements to gate, or a render prop receiving
   * `(ctx: { can: (resource, action) => boolean; role })` for bespoke UI decisions.
   */
  children: ReactNode;
}

export function PermissionGate({
  resource,
  action,
  fallback = "hide",
  redirectTo = "/dashboard",
  children,
}: PermissionGateProps) {
  const { can, role } = usePermissions();
  const allowed = can(resource, action);
  const router = useRouter();

  useEffect(() => {
    if (!allowed && fallback === "redirect") {
      router.replace(redirectTo);
    }
  }, [allowed, fallback, redirectTo, router]);

  if (allowed) {
    return (
      <>
        {typeof children === "function"
          ? (
              children as (ctx: {
                can: (resource: Resource, action: Action) => boolean;
                role: Role | null;
              }) => ReactNode
            )({ can, role })
          : children}
      </>
    );
  }

  switch (fallback) {
    case "disable": {
      if (isValidElement(children)) {
        const element = children as ReactElement<{ disabled?: boolean; "aria-disabled"?: boolean }>;
        return cloneElement(element, { disabled: true, "aria-disabled": true });
      }
      return null;
    }
    case "redirect":
      return null;
    case "hide":
    default:
      return null;
  }
}
