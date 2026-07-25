/**
 * Lease-based distributed job scheduler primitives for trusted service runtimes.
 *
 * The frontend package owns the shared TypeScript contract used by operations
 * dashboards, service adapters, and unit tests. Browser code may display job
 * state, but workers that claim and execute jobs must run server-side against a
 * durable store that provides compare-and-swap updates on `lockVersion`.
 */

export const JOB_SCHEDULER_SCHEMA_VERSION = 1;
export const DEFAULT_LEASE_DURATION_MS = 30_000;
export const DEFAULT_CLAIM_LIMIT = 25;
export const MAX_CLAIM_LIMIT = 100;

export type ScheduledJobStatus = "queued" | "leased" | "completed" | "failed";

export interface ScheduledJob<Payload = unknown> {
  id: string;
  queue: string;
  payload: Payload;
  status: ScheduledJobStatus;
  priority: number;
  runAt: number;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  updatedAt: number;
  leaseOwner?: string;
  leaseUntil?: number;
  lockVersion: number;
  lastError?: string;
  idempotencyKey?: string;
}

export interface ClaimedJob<Payload = unknown> extends ScheduledJob<Payload> {
  status: "leased";
  leaseOwner: string;
  leaseUntil: number;
}

export interface JobSchedulerMetric {
  name:
    | "scheduler_claim_attempt"
    | "scheduler_claimed_jobs"
    | "scheduler_job_completed"
    | "scheduler_job_failed"
    | "scheduler_lease_renewed";
  value: number;
  tags: Record<string, string>;
  timestamp: number;
}

export interface ClaimJobsInput {
  queue: string;
  workerId: string;
  limit?: number;
  leaseDurationMs?: number;
  now?: number;
}

export interface JobSchedulerStore<Payload = unknown> {
  enqueue(job: Omit<ScheduledJob<Payload>, "status" | "attempts" | "createdAt" | "updatedAt" | "lockVersion">): Promise<ScheduledJob<Payload>>;
  claimDueJobs(input: Required<ClaimJobsInput>): Promise<ClaimedJob<Payload>[]>;
  complete(jobId: string, workerId: string, lockVersion: number, now: number): Promise<boolean>;
  fail(jobId: string, workerId: string, lockVersion: number, error: string, retryAt: number, now: number): Promise<boolean>;
  renewLease(jobId: string, workerId: string, lockVersion: number, leaseUntil: number, now: number): Promise<ClaimedJob<Payload> | null>;
}

export interface JobSchedulerOptions<Payload = unknown> {
  store: JobSchedulerStore<Payload>;
  now?: () => number;
  onMetric?: (metric: JobSchedulerMetric) => void;
}

function sanitizeTag(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 80);
}

function normalizeLimit(limit = DEFAULT_CLAIM_LIMIT): number {
  if (!Number.isInteger(limit) || limit < 1) return DEFAULT_CLAIM_LIMIT;
  return Math.min(limit, MAX_CLAIM_LIMIT);
}

function normalizeLease(leaseDurationMs = DEFAULT_LEASE_DURATION_MS): number {
  return Math.max(1_000, Math.min(leaseDurationMs, 15 * 60_000));
}

export class LeaseBasedJobScheduler<Payload = unknown> {
  private readonly now: () => number;
  private readonly onMetric?: (metric: JobSchedulerMetric) => void;

  constructor(private readonly store: JobSchedulerStore<Payload>, options: Omit<JobSchedulerOptions<Payload>, "store"> = {}) {
    this.now = options.now ?? Date.now;
    this.onMetric = options.onMetric;
  }

  async enqueue(job: Parameters<JobSchedulerStore<Payload>["enqueue"]>[0]): Promise<ScheduledJob<Payload>> {
    return this.store.enqueue(job);
  }

  async claimDueJobs(input: ClaimJobsInput): Promise<ClaimedJob<Payload>[]> {
    const now = input.now ?? this.now();
    const limit = normalizeLimit(input.limit);
    const leaseDurationMs = normalizeLease(input.leaseDurationMs);
    this.emit("scheduler_claim_attempt", 1, input.queue, input.workerId, now);
    const jobs = await this.store.claimDueJobs({ ...input, limit, leaseDurationMs, now });
    this.emit("scheduler_claimed_jobs", jobs.length, input.queue, input.workerId, now);
    return jobs;
  }

  async complete(job: Pick<ClaimedJob<Payload>, "id" | "leaseOwner" | "lockVersion" | "queue">): Promise<boolean> {
    const now = this.now();
    const ok = await this.store.complete(job.id, job.leaseOwner, job.lockVersion, now);
    if (ok) this.emit("scheduler_job_completed", 1, job.queue, job.leaseOwner, now);
    return ok;
  }

  async fail(job: Pick<ClaimedJob<Payload>, "id" | "leaseOwner" | "lockVersion" | "queue">, error: string, retryAt: number): Promise<boolean> {
    const now = this.now();
    const ok = await this.store.fail(job.id, job.leaseOwner, job.lockVersion, error.slice(0, 500), retryAt, now);
    if (ok) this.emit("scheduler_job_failed", 1, job.queue, job.leaseOwner, now);
    return ok;
  }

  async renewLease(job: Pick<ClaimedJob<Payload>, "id" | "leaseOwner" | "lockVersion" | "queue">, leaseDurationMs = DEFAULT_LEASE_DURATION_MS): Promise<ClaimedJob<Payload> | null> {
    const now = this.now();
    const renewed = await this.store.renewLease(job.id, job.leaseOwner, job.lockVersion, now + normalizeLease(leaseDurationMs), now);
    if (renewed) this.emit("scheduler_lease_renewed", 1, job.queue, job.leaseOwner, now);
    return renewed;
  }

  private emit(name: JobSchedulerMetric["name"], value: number, queue: string, workerId: string, timestamp: number): void {
    this.onMetric?.({ name, value, tags: { queue: sanitizeTag(queue), worker: sanitizeTag(workerId) }, timestamp });
  }
}

/** In-memory CAS store for tests and local development; production must use a durable database. */
export class InMemoryJobSchedulerStore<Payload = unknown> implements JobSchedulerStore<Payload> {
  private readonly jobs = new Map<string, ScheduledJob<Payload>>();
  private readonly idempotency = new Map<string, string>();

  async enqueue(job: Omit<ScheduledJob<Payload>, "status" | "attempts" | "createdAt" | "updatedAt" | "lockVersion">): Promise<ScheduledJob<Payload>> {
    if (job.idempotencyKey) {
      const existingId = this.idempotency.get(job.idempotencyKey);
      const existing = existingId ? this.jobs.get(existingId) : undefined;
      if (existing) return { ...existing };
      this.idempotency.set(job.idempotencyKey, job.id);
    }
    const now = Date.now();
    const record: ScheduledJob<Payload> = { ...job, status: "queued", attempts: 0, createdAt: now, updatedAt: now, lockVersion: 0 };
    this.jobs.set(job.id, record);
    return { ...record };
  }

  async claimDueJobs(input: Required<ClaimJobsInput>): Promise<ClaimedJob<Payload>[]> {
    const due = [...this.jobs.values()]
      .filter((job) => job.queue === input.queue && job.status !== "completed" && job.attempts < job.maxAttempts && job.runAt <= input.now && (!job.leaseUntil || job.leaseUntil <= input.now))
      .sort((a, b) => b.priority - a.priority || a.runAt - b.runAt || a.createdAt - b.createdAt)
      .slice(0, input.limit);

    return due.map((job) => {
      const claimed: ClaimedJob<Payload> = { ...job, status: "leased", attempts: job.attempts + 1, leaseOwner: input.workerId, leaseUntil: input.now + input.leaseDurationMs, updatedAt: input.now, lockVersion: job.lockVersion + 1 };
      this.jobs.set(job.id, claimed);
      return { ...claimed };
    });
  }

  async complete(jobId: string, workerId: string, lockVersion: number, now: number): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "leased" || job.leaseOwner !== workerId || job.lockVersion !== lockVersion || (job.leaseUntil ?? 0) <= now) return false;
    this.jobs.set(jobId, { ...job, status: "completed", updatedAt: now, lockVersion: lockVersion + 1 });
    return true;
  }

  async fail(jobId: string, workerId: string, lockVersion: number, error: string, retryAt: number, now: number): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "leased" || job.leaseOwner !== workerId || job.lockVersion !== lockVersion) return false;
    const terminal = job.attempts >= job.maxAttempts;
    this.jobs.set(jobId, { ...job, status: terminal ? "failed" : "queued", runAt: terminal ? job.runAt : retryAt, leaseOwner: undefined, leaseUntil: undefined, updatedAt: now, lockVersion: lockVersion + 1, lastError: error });
    return true;
  }

  async renewLease(jobId: string, workerId: string, lockVersion: number, leaseUntil: number, now: number): Promise<ClaimedJob<Payload> | null> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "leased" || job.leaseOwner !== workerId || job.lockVersion !== lockVersion || (job.leaseUntil ?? 0) <= now) return null;
    const renewed: ClaimedJob<Payload> = { ...job, status: "leased", leaseOwner: workerId, leaseUntil, updatedAt: now, lockVersion: lockVersion + 1 };
    this.jobs.set(jobId, renewed);
    return { ...renewed };
  }
}
