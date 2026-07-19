/**
 * Shared contract and guardrails for database-backup restore verification.
 *
 * Production services emit this small, secret-free result after restoring the
 * newest backup into an isolated database and exercising its health checks.
 * The scheduler, dashboards, and alert rules consume the same contract so a
 * backup is never considered healthy merely because an upload succeeded.
 */

export const BACKUP_VERIFICATION_SCHEMA_VERSION = 1;
export const DEFAULT_MAX_BACKUP_AGE_MS = 26 * 60 * 60 * 1000;

export type BackupVerificationStatus = "passed" | "failed";

export interface BackupVerificationResult {
  schemaVersion: typeof BACKUP_VERIFICATION_SCHEMA_VERSION;
  service: string;
  environment: "staging" | "production";
  status: BackupVerificationStatus;
  backupCreatedAt: string;
  restoreStartedAt: string;
  restoreCompletedAt: string;
  /** SHA-256 (or equivalent) of the encrypted backup artifact. */
  artifactChecksum: string;
  /** Stable reason code; do not place credentials or query output here. */
  failureReason?: string;
}

export interface BackupVerificationAssessment {
  status: BackupVerificationStatus;
  backupAgeMs: number;
  restoreDurationMs: number;
  reason?: "backup_too_old" | "restore_failed" | "invalid_timestamps";
}

function timestamp(value: string): number {
  return Date.parse(value);
}

/**
 * Validates a restore-verification result before it is published to telemetry.
 * A failed restore always wins over freshness, and invalid clocks fail closed.
 */
export function assessBackupVerification(
  result: BackupVerificationResult,
  now = Date.now(),
  maxBackupAgeMs = DEFAULT_MAX_BACKUP_AGE_MS
): BackupVerificationAssessment {
  const backupCreatedAt = timestamp(result.backupCreatedAt);
  const restoreStartedAt = timestamp(result.restoreStartedAt);
  const restoreCompletedAt = timestamp(result.restoreCompletedAt);

  if (
    !Number.isFinite(backupCreatedAt) ||
    !Number.isFinite(restoreStartedAt) ||
    !Number.isFinite(restoreCompletedAt) ||
    restoreCompletedAt < restoreStartedAt ||
    backupCreatedAt > now
  ) {
    return {
      status: "failed",
      backupAgeMs: Number.NaN,
      restoreDurationMs: Number.NaN,
      reason: "invalid_timestamps",
    };
  }

  const backupAgeMs = now - backupCreatedAt;
  const restoreDurationMs = restoreCompletedAt - restoreStartedAt;

  if (result.status === "failed") {
    return { status: "failed", backupAgeMs, restoreDurationMs, reason: "restore_failed" };
  }

  if (backupAgeMs > maxBackupAgeMs) {
    return { status: "failed", backupAgeMs, restoreDurationMs, reason: "backup_too_old" };
  }

  return { status: "passed", backupAgeMs, restoreDurationMs };
}

/**
 * Produces the metrics payload accepted by the backup verification control
 * plane. The payload deliberately omits backup locations and database names.
 */
export function toBackupVerificationMetrics(
  result: BackupVerificationResult,
  assessment: BackupVerificationAssessment
) {
  return {
    service: result.service,
    environment: result.environment,
    verification_success: assessment.status === "passed" ? 1 : 0,
    backup_age_seconds: assessment.backupAgeMs / 1000,
    restore_duration_seconds: assessment.restoreDurationMs / 1000,
    failure_reason: assessment.reason,
    verified_at: result.restoreCompletedAt,
  };
}
