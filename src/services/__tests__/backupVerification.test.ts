import { describe, expect, it } from "vitest";
import {
  assessBackupVerification,
  DEFAULT_MAX_BACKUP_AGE_MS,
  toBackupVerificationMetrics,
  type BackupVerificationResult,
} from "@/src/services/backupVerification";

const now = Date.parse("2026-07-17T12:00:00.000Z");

function result(overrides: Partial<BackupVerificationResult> = {}): BackupVerificationResult {
  return {
    schemaVersion: 1,
    service: "certification-api",
    environment: "production",
    status: "passed",
    backupCreatedAt: "2026-07-17T11:00:00.000Z",
    restoreStartedAt: "2026-07-17T11:58:00.000Z",
    restoreCompletedAt: "2026-07-17T11:59:30.000Z",
    artifactChecksum: "sha256:abc123",
    ...overrides,
  };
}

describe("assessBackupVerification", () => {
  it("accepts a recent successful isolated restore", () => {
    expect(assessBackupVerification(result(), now)).toEqual({
      status: "passed",
      backupAgeMs: 60 * 60 * 1000,
      restoreDurationMs: 90 * 1000,
    });
  });

  it("fails a successful restore when its backup is stale", () => {
    const assessment = assessBackupVerification(
      result({ backupCreatedAt: "2026-07-16T09:00:00.000Z" }),
      now
    );
    expect(assessment.status).toBe("failed");
    expect(assessment.reason).toBe("backup_too_old");
    expect(assessment.backupAgeMs).toBeGreaterThan(DEFAULT_MAX_BACKUP_AGE_MS);
  });

  it("fails closed when the restore failed, regardless of backup age", () => {
    expect(assessBackupVerification(result({ status: "failed" }), now).reason).toBe("restore_failed");
  });

  it("fails closed for invalid or reversed timestamps", () => {
    const assessment = assessBackupVerification(
      result({ restoreCompletedAt: "2026-07-17T11:57:00.000Z" }),
      now
    );
    expect(assessment).toMatchObject({ status: "failed", reason: "invalid_timestamps" });
  });

  it("creates a secret-free telemetry payload", () => {
    const metrics = toBackupVerificationMetrics(result(), assessBackupVerification(result(), now));
    expect(metrics).toEqual({
      service: "certification-api",
      environment: "production",
      verification_success: 1,
      backup_age_seconds: 3600,
      restore_duration_seconds: 90,
      failure_reason: undefined,
      verified_at: "2026-07-17T11:59:30.000Z",
    });
    expect(JSON.stringify(metrics)).not.toContain("sha256:abc123");
  });
});
