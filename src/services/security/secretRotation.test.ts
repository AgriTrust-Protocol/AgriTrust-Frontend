import { describe, expect, it, vi } from "vitest";
import { SecretRotationService, type RotationAuditEvent, type SecretVersionRef } from "./secretRotation";

const active: SecretVersionRef = { secretId: "db-primary", versionId: "v1", kind: "database-credential", createdAt: 1 };
const candidate: SecretVersionRef = { ...active, versionId: "v2", createdAt: 2 };

function deps(overrides = {}) {
  const audit: RotationAuditEvent[] = [];
  return {
    now: vi.fn(() => 1000),
    generateCandidate: vi.fn(async () => candidate),
    enableDualRead: vi.fn(async () => undefined),
    promoteCandidate: vi.fn(async () => undefined),
    revokeVersion: vi.fn(async () => undefined),
    rollback: vi.fn(async () => undefined),
    checkHealth: vi.fn(async () => ({ healthy: true, p99LatencyMs: 42, errorRate: 0, healthyInstances: 3 })),
    emitMetric: vi.fn(),
    audit: vi.fn((event: RotationAuditEvent) => audit.push(event)),
    auditEvents: audit,
    ...overrides,
  };
}

describe("SecretRotationService", () => {
  it("rotates through dual-read, promote, revoke, and complete without exposing secret values", async () => {
    const d = deps();
    const service = new SecretRotationService(d);
    const result = await service.rotate({ service: "orders", secretId: "db-primary", kind: "database-credential", criticalPath: true, minHealthyInstances: 2 }, active);

    expect(result.status).toBe("succeeded");
    expect(d.enableDualRead).toHaveBeenCalledOnce();
    expect(d.promoteCandidate).toHaveBeenCalledOnce();
    expect(d.revokeVersion).toHaveBeenCalledWith(active);
    expect(d.auditEvents.map((event) => event.phase)).toEqual(["prepare", "dual-read", "promote", "revoke", "complete"]);
    expect(JSON.stringify(d.auditEvents)).not.toContain("password");
  });

  it("rolls back when critical path latency exceeds the 100ms P99 target", async () => {
    const d = deps({ checkHealth: vi.fn(async () => ({ healthy: true, p99LatencyMs: 101, errorRate: 0, healthyInstances: 3 })) });
    const service = new SecretRotationService(d);

    await expect(service.rotate({ service: "orders", secretId: "db-primary", kind: "database-credential", criticalPath: true }, active)).rejects.toThrow("P99 latency");
    expect(d.rollback).toHaveBeenCalledOnce();
    expect(d.emitMetric).toHaveBeenCalledWith("secret_rotation_failure_total", 1, expect.objectContaining({ service: "orders" }));
  });
});
