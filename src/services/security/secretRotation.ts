/**
 * Server-side secret rotation orchestration for database credentials and API keys.
 *
 * This module is intentionally provider-neutral and secret-value opaque: callers
 * pass secret versions by reference and the orchestrator never logs, persists, or
 * returns raw credential material. Use it only from trusted service runtimes.
 */
export type SecretKind = "database-credential" | "api-key";
export type RotationPhase = "prepare" | "dual-read" | "promote" | "revoke" | "complete";
export type RotationStatus = "pending" | "running" | "succeeded" | "failed" | "rolled-back";

export interface SecretVersionRef {
  secretId: string;
  versionId: string;
  kind: SecretKind;
  createdAt: number;
}

export interface RotationTarget {
  service: string;
  secretId: string;
  kind: SecretKind;
  criticalPath?: boolean;
  minHealthyInstances?: number;
}

export interface RotationPlan {
  rotationId: string;
  target: RotationTarget;
  activeVersion: SecretVersionRef;
  candidateVersion: SecretVersionRef;
  startedAt: number;
  deadlineAt: number;
  phase: RotationPhase;
  status: RotationStatus;
}

export interface RotationHealth {
  healthy: boolean;
  p99LatencyMs: number;
  errorRate: number;
  healthyInstances: number;
}

export interface RotationAuditEvent {
  rotationId: string;
  service: string;
  secretId: string;
  phase: RotationPhase;
  status: RotationStatus;
  timestamp: number;
  reason?: string;
}

export interface SecretRotationDependencies {
  now?: () => number;
  generateCandidate(target: RotationTarget): Promise<SecretVersionRef>;
  enableDualRead(plan: RotationPlan): Promise<void>;
  promoteCandidate(plan: RotationPlan): Promise<void>;
  revokeVersion(version: SecretVersionRef): Promise<void>;
  rollback(plan: RotationPlan): Promise<void>;
  checkHealth(target: RotationTarget): Promise<RotationHealth>;
  emitMetric(name: string, value: number, labels: Record<string, string>): void;
  audit(event: RotationAuditEvent): void | Promise<void>;
}

export interface SecretRotationOptions {
  rotationTtlMs?: number;
  criticalPathP99Ms?: number;
  maxErrorRate?: number;
}

const DEFAULT_ROTATION_TTL_MS = 15 * 60 * 1000;
const DEFAULT_CRITICAL_PATH_P99_MS = 100;
const DEFAULT_MAX_ERROR_RATE = 0.001;

export class SecretRotationService {
  private readonly now: () => number;
  private readonly rotationTtlMs: number;
  private readonly criticalPathP99Ms: number;
  private readonly maxErrorRate: number;

  constructor(
    private readonly dependencies: SecretRotationDependencies,
    options: SecretRotationOptions = {}
  ) {
    this.now = dependencies.now ?? Date.now;
    this.rotationTtlMs = options.rotationTtlMs ?? DEFAULT_ROTATION_TTL_MS;
    this.criticalPathP99Ms = options.criticalPathP99Ms ?? DEFAULT_CRITICAL_PATH_P99_MS;
    this.maxErrorRate = options.maxErrorRate ?? DEFAULT_MAX_ERROR_RATE;
  }

  async rotate(target: RotationTarget, activeVersion: SecretVersionRef): Promise<RotationPlan> {
    this.assertSameSecret(target, activeVersion);
    const rotationId = this.buildRotationId(target, activeVersion);
    let plan: RotationPlan = {
      rotationId,
      target,
      activeVersion,
      candidateVersion: await this.dependencies.generateCandidate(target),
      startedAt: this.now(),
      deadlineAt: this.now() + this.rotationTtlMs,
      phase: "prepare",
      status: "running",
    };

    try {
      this.assertSameSecret(target, plan.candidateVersion);
      await this.record(plan);
      await this.ensureHealthy(plan);

      plan = this.advance(plan, "dual-read");
      await this.dependencies.enableDualRead(plan);
      await this.record(plan);
      await this.ensureHealthy(plan);

      plan = this.advance(plan, "promote");
      await this.dependencies.promoteCandidate(plan);
      await this.record(plan);
      await this.ensureHealthy(plan);

      plan = this.advance(plan, "revoke");
      await this.dependencies.revokeVersion(activeVersion);
      await this.record(plan);

      plan = { ...this.advance(plan, "complete"), status: "succeeded" };
      await this.record(plan);
      this.dependencies.emitMetric("secret_rotation_success_total", 1, this.labels(plan));
      return plan;
    } catch (error) {
      await this.dependencies.rollback(plan);
      const failedPlan: RotationPlan = { ...plan, status: "rolled-back" };
      await this.record(failedPlan, error instanceof Error ? error.message : "rotation failed");
      this.dependencies.emitMetric("secret_rotation_failure_total", 1, this.labels(failedPlan));
      throw error;
    }
  }

  private async ensureHealthy(plan: RotationPlan): Promise<void> {
    if (this.now() > plan.deadlineAt) throw new Error("Secret rotation exceeded deadline");
    const health = await this.dependencies.checkHealth(plan.target);
    this.dependencies.emitMetric("secret_rotation_p99_latency_ms", health.p99LatencyMs, this.labels(plan));
    this.dependencies.emitMetric("secret_rotation_error_rate", health.errorRate, this.labels(plan));
    if (!health.healthy) throw new Error("Secret rotation health check failed");
    if (plan.target.criticalPath && health.p99LatencyMs > this.criticalPathP99Ms) {
      throw new Error(`Critical path P99 latency ${health.p99LatencyMs}ms exceeds ${this.criticalPathP99Ms}ms`);
    }
    if (health.errorRate > this.maxErrorRate) throw new Error("Secret rotation error budget check failed");
    if (plan.target.minHealthyInstances && health.healthyInstances < plan.target.minHealthyInstances) {
      throw new Error("Secret rotation healthy instance quorum failed");
    }
  }

  private advance(plan: RotationPlan, phase: RotationPhase): RotationPlan {
    return { ...plan, phase };
  }

  private async record(plan: RotationPlan, reason?: string): Promise<void> {
    await this.dependencies.audit({
      rotationId: plan.rotationId,
      service: plan.target.service,
      secretId: plan.target.secretId,
      phase: plan.phase,
      status: plan.status,
      timestamp: this.now(),
      reason,
    });
  }

  private labels(plan: RotationPlan): Record<string, string> {
    return {
      service: plan.target.service,
      secret_kind: plan.target.kind,
      phase: plan.phase,
      critical_path: String(plan.target.criticalPath === true),
    };
  }

  private assertSameSecret(target: RotationTarget, version: SecretVersionRef): void {
    if (target.secretId !== version.secretId || target.kind !== version.kind) {
      throw new Error("Secret version does not match rotation target");
    }
  }

  private buildRotationId(target: RotationTarget, activeVersion: SecretVersionRef): string {
    return `${target.service}:${target.secretId}:${activeVersion.versionId}:${this.now()}`;
  }
}
