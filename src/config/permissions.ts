/**
 * Static role → resource → action permission matrix.
 *
 * Policies are plain TypeScript const objects, loaded at build time and
 * tree-shakeable. Resolution helpers are synchronous so a gate evaluation
 * completes in well under 1ms.
 *
 * Wildcards: `admin:*` grants every admin action on any resource;
 * `["*"]` grants every action on the granted resource.
 *
 * Inheritance: ORGANIZATION_ADMIN inherits everything from
 * CERTIFICATION_MANAGER (which inherits FIELD_INSPECTOR, which inherits
 * VIEWER) — see `ROLE_INHERITANCE` in `src/types/auth.ts`.
 */

import {
  resolveInheritanceChain,
  WILDCARD,
  type Action,
  type PermissionGrant,
  type PermissionPolicy,
  type Resource,
  type Role,
} from "@/src/types/auth";

/** Grants for the least-privileged role. */
const VIEWER_GRANTS: readonly PermissionGrant[] = [
  { resource: "dashboard", actions: ["read"] },
  { resource: "certificate", actions: ["read"] },
  { resource: "batch", actions: ["read"] },
];

const FIELD_INSPECTOR_GRANTS: readonly PermissionGrant[] = [
  { resource: "certificate", actions: ["read", "verify"] },
  { resource: "batch", actions: ["read", "update"] },
];

const CERTIFICATION_MANAGER_GRANTS: readonly PermissionGrant[] = [
  { resource: "certificate", actions: ["read", "verify", "issue", "revoke"] },
  { resource: "batch", actions: ["read", "create", "update", "verify"] },
];

/** `admin:*` — wildcard grant covering every action on every resource. */
const ORGANIZATION_ADMIN_GRANTS: readonly PermissionGrant[] = [
  { resource: WILDCARD, actions: [WILDCARD] },
];

/**
 * The build-time policy matrix. Lookup order for a `(role, resource,
 * action)` triple walks the role's inheritance chain from most specific
 * to least specific and stops at the first match.
 */
export const PERMISSION_POLICY: PermissionPolicy = new Map<
  Role | typeof WILDCARD,
  readonly PermissionGrant[]
>([
  ["ORGANIZATION_ADMIN", ORGANIZATION_ADMIN_GRANTS],
  ["CERTIFICATION_MANAGER", CERTIFICATION_MANAGER_GRANTS],
  ["FIELD_INSPECTOR", FIELD_INSPECTOR_GRANTS],
  ["VIEWER", VIEWER_GRANTS],
]);

function grantsAllow(grants: readonly PermissionGrant[], resource: Resource, action: Action): boolean {
  return grants.some(
    (grant) =>
      (grant.resource === WILDCARD || grant.resource === resource) &&
      (grant.actions[0] === WILDCARD || grant.actions.includes(action)),
  );
}

/**
 * Resolve whether `role` is allowed to perform `action` on `resource`,
 * honouring wildcards and the inheritance chain. Synchronous; safe to
 * call during render.
 */
export function can(role: Role | null | undefined, resource: Resource, action: Action): boolean {
  if (!role) return false;
  const chain = resolveInheritanceChain(role);
  for (const chainRole of chain) {
    const grants = PERMISSION_POLICY.get(chainRole);
    if (grants && grantsAllow(grants, resource, action)) return true;
  }
  // A hypothetical wildcard role entry (e.g. loaded from remote config).
  const wildcardGrants = PERMISSION_POLICY.get(WILDCARD);
  return Boolean(wildcardGrants && grantsAllow(wildcardGrants, resource, action));
}
