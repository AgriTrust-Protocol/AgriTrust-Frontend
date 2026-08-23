/**
 * Role-based access control primitives shared by the permission policy
 * configuration, the `usePermissions` hook, and the `PermissionGate`
 * component.
 *
 * Policies are resolved synchronously (no async lookups) so a gate
 * evaluation stays well under 1ms.
 */

/** Roles known to the AgriTrust access-control smart contract. */
export const ROLES = [
  "ORGANIZATION_ADMIN",
  "CERTIFICATION_MANAGER",
  "FIELD_INSPECTOR",
  "VIEWER",
] as const;

export type Role = (typeof ROLES)[number];

/** Actions that can be performed on a resource. */
export const ACTIONS = [
  "create",
  "read",
  "update",
  "verify",
  "revoke",
  "issue",
  "admin",
] as const;

export type Action = (typeof ACTIONS)[number];

/** Resources protected by the policy matrix. */
export const RESOURCES = [
  "certificate",
  "batch",
  "dashboard",
  "organization",
] as const;

export type Resource = (typeof RESOURCES)[number];

/**
 * Wildcard accepted wherever a Role, Resource or Action is expected.
 * e.g. `admin:*` grants every admin action; `*:*` grants everything.
 */
export const WILDCARD = "*";

/** A single grant: role → resource → actions (may contain wildcards). */
export type PermissionGrant = {
  resource: Resource | typeof WILDCARD;
  actions: readonly (Action | typeof WILDCARD)[];
};

/**
 * Policy definition: a static, tree-shakeable map of role to its grants.
 * Stored as plain TypeScript const objects and loaded at build time.
 */
export type PermissionPolicy = Readonly<
  Map<Role | typeof WILDCARD, readonly PermissionGrant[]>
>;

/** Hierarchical chain: each role inherits all permissions of the next. */
export const ROLE_INHERITANCE: Readonly<Record<Role, readonly Role[]>> = {
  ORGANIZATION_ADMIN: ["CERTIFICATION_MANAGER", "FIELD_INSPECTOR", "VIEWER"],
  CERTIFICATION_MANAGER: ["FIELD_INSPECTOR", "VIEWER"],
  FIELD_INSPECTOR: ["VIEWER"],
  VIEWER: [],
};

/** Full inheritance chain for a role (itself + ancestors), most specific first. */
export function resolveInheritanceChain(role: Role): readonly Role[] {
  return [role, ...ROLE_INHERITANCE[role]];
}
