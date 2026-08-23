/**
 * Unit tests for the static permission policy matrix
 * (`src/config/permissions.ts`) covering wildcard expansion,
 * inheritance-chain traversal, and denial defaults.
 */

import { describe, it, expect } from "vitest";
import { can } from "@/src/config/permissions";
import {
  resolveInheritanceChain,
  ROLE_INHERITANCE,
} from "@/src/types/auth";

describe("permission policy matrix", () => {
  describe("wildcard behaviour", () => {
    it("grants ORGANIZATION_ADMIN every action on every resource via *:* ", () => {
      expect(can("ORGANIZATION_ADMIN", "certificate", "issue")).toBe(true);
      expect(can("ORGANIZATION_ADMIN", "certificate", "revoke")).toBe(true);
      expect(can("ORGANIZATION_ADMIN", "organization", "admin")).toBe(true);
      expect(can("ORGANIZATION_ADMIN", "batch", "create")).toBe(true);
    });

    it("resolves within 1ms per evaluation", () => {
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        can("CERTIFICATION_MANAGER", "certificate", "verify");
      }
      const elapsedPerEval = (performance.now() - start) / 1000;
      expect(elapsedPerEval).toBeLessThan(1);
    });
  });

  describe("inheritance chain", () => {
    it("orders roles from most specific to least specific", () => {
      expect(resolveInheritanceChain("ORGANIZATION_ADMIN")).toEqual([
        "ORGANIZATION_ADMIN",
        "CERTIFICATION_MANAGER",
        "FIELD_INSPECTOR",
        "VIEWER",
      ]);
      expect(resolveInheritanceChain("VIEWER")).toEqual(["VIEWER"]);
    });

    it("lets ORGANIZATION_ADMIN inherit all CERTIFICATION_MANAGER permissions", () => {
      // Declared on CERTIFICATION_MANAGER:
      expect(can("ORGANIZATION_ADMIN", "certificate", "issue")).toBe(true);
      // Declared on FIELD_INSPECTOR:
      expect(can("ORGANIZATION_ADMIN", "batch", "update")).toBe(true);
      // Declared on VIEWER:
      expect(can("ORGANIZATION_ADMIN", "dashboard", "read")).toBe(true);
    });

    it("does not grant inherited permissions upward (VIEWER stays read-only)", () => {
      expect(can("VIEWER", "certificate", "read")).toBe(true);
      expect(can("VIEWER", "certificate", "issue")).toBe(false);
      expect(can("VIEWER", "certificate", "verify")).toBe(false);
      expect(can("FIELD_INSPECTOR", "certificate", "issue")).toBe(false);
    });

    it("gives CERTIFICATION_MANAGER inspector powers through inheritance", () => {
      expect(can("CERTIFICATION_MANAGER", "batch", "update")).toBe(true);
      expect(can("CERTIFICATION_MANAGER", "certificate", "verify")).toBe(true);
    });
  });

  describe("explicit grants", () => {
    it("allows certificate lifecycle actions for CERTIFICATION_MANAGER", () => {
      expect(can("CERTIFICATION_MANAGER", "certificate", "issue")).toBe(true);
      expect(can("CERTIFICATION_MANAGER", "certificate", "revoke")).toBe(true);
      expect(can("CERTIFICATION_MANAGER", "organization", "admin")).toBe(false);
    });
  });

  describe("denial defaults", () => {
    it("denies everything for anonymous users", () => {
      expect(can(null, "dashboard", "read")).toBe(false);
      expect(can(undefined, "certificate", "read")).toBe(false);
    });
  });

  describe("inheritance table integrity", () => {
    it("every role has an inheritance entry", () => {
      for (const role of [
        "ORGANIZATION_ADMIN",
        "CERTIFICATION_MANAGER",
        "FIELD_INSPECTOR",
        "VIEWER",
      ] as const) {
        expect(ROLE_INHERITANCE[role]).toBeDefined();
      }
    });
  });
});
