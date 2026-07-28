import { describe, expect, it } from "vitest";
import { InMemoryJobSchedulerStore, LeaseBasedJobScheduler, type JobSchedulerMetric } from "../jobScheduler";

const baseJob = {
  id: "job-1",
  queue: "certification",
  payload: { batchId: "batch-1" },
  priority: 10,
  runAt: 1_000,
  maxAttempts: 2,
};

describe("LeaseBasedJobScheduler", () => {
  it("claims due jobs once per active lease", async () => {
    const store = new InMemoryJobSchedulerStore();
    await store.enqueue(baseJob);
    const scheduler = new LeaseBasedJobScheduler(store, { now: () => 1_000 });

    const first = await scheduler.claimDueJobs({ queue: "certification", workerId: "worker-a", leaseDurationMs: 5_000 });
    const second = await scheduler.claimDueJobs({ queue: "certification", workerId: "worker-b", leaseDurationMs: 5_000 });

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ id: "job-1", leaseOwner: "worker-a", attempts: 1 });
    expect(second).toHaveLength(0);
  });

  it("allows another worker to reclaim an expired lease", async () => {
    const store = new InMemoryJobSchedulerStore();
    await store.enqueue(baseJob);
    const scheduler = new LeaseBasedJobScheduler(store);

    await scheduler.claimDueJobs({ queue: "certification", workerId: "worker-a", now: 1_000, leaseDurationMs: 5_000 });
    const reclaimed = await scheduler.claimDueJobs({ queue: "certification", workerId: "worker-b", now: 6_001, leaseDurationMs: 5_000 });

    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]).toMatchObject({ leaseOwner: "worker-b", attempts: 2 });
  });

  it("rejects stale completion attempts through lock-version compare-and-swap", async () => {
    const store = new InMemoryJobSchedulerStore();
    await store.enqueue(baseJob);
    const scheduler = new LeaseBasedJobScheduler(store, { now: () => 1_500 });
    const [claimed] = await scheduler.claimDueJobs({ queue: "certification", workerId: "worker-a", now: 1_000, leaseDurationMs: 5_000 });
    const renewed = await scheduler.renewLease(claimed, 10_000);

    expect(renewed).not.toBeNull();
    await expect(scheduler.complete(claimed)).resolves.toBe(false);
    await expect(scheduler.complete(renewed!)).resolves.toBe(true);
  });

  it("deduplicates enqueue requests by idempotency key", async () => {
    const store = new InMemoryJobSchedulerStore();
    const first = await store.enqueue({ ...baseJob, idempotencyKey: "cert:batch-1" });
    const duplicate = await store.enqueue({ ...baseJob, id: "job-2", idempotencyKey: "cert:batch-1" });

    expect(duplicate.id).toBe(first.id);
  });

  it("emits low-cardinality scheduler metrics", async () => {
    const store = new InMemoryJobSchedulerStore();
    const metrics: string[] = [];
    await store.enqueue(baseJob);
    const scheduler = new LeaseBasedJobScheduler(store, {
      now: () => 1_000,
      onMetric: (metric: JobSchedulerMetric) => metrics.push(`${metric.name}:${metric.tags.queue}:${metric.tags.worker}:${metric.value}`),
    });

    await scheduler.claimDueJobs({ queue: "certification queue", workerId: "worker/a", leaseDurationMs: 5_000 });

    expect(metrics).toEqual([
      "scheduler_claim_attempt:certification_queue:worker_a:1",
      "scheduler_claimed_jobs:certification_queue:worker_a:1",
    ]);
  });
});
