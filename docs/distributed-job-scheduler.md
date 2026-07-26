# Distributed job scheduler

AgriTrust service workers use a lease-based scheduler for asynchronous work such
as certification refreshes, webhook outbox delivery, backup verification, and
ledger reconciliation. The scheduler contract is versioned in
`src/services/jobScheduler.ts` so UI dashboards, worker adapters, and runbooks
share the same state model.

## Architecture

1. API handlers enqueue jobs into a durable database table with an idempotency
   key, queue name, priority, `run_at`, attempt budget, payload, and
   `lock_version`.
2. Workers claim due jobs with a single compare-and-swap update that sets
   `status = leased`, `lease_owner`, `lease_until`, increments attempts, and
   increments `lock_version`.
3. Workers complete, fail, or renew leases only when `worker_id` and
   `lock_version` still match. Stale workers cannot overwrite a newer claim.
4. Expired leases return to the eligible set automatically; terminal failures
   remain queryable for operator replay.
5. Dashboards consume low-cardinality metrics and never include job payloads,
   customer identifiers, endpoint URLs, secrets, or free-form error bodies.

## Performance and availability guardrails

- Keep claim batches at or below 100 jobs; the shared scheduler defaults to 25.
- Index production stores on `(queue, run_at, lease_until, priority)` and use
  `SKIP LOCKED` or equivalent optimistic concurrency to keep claim latency below
  the 100 ms P99 critical-path budget.
- Lease duration defaults to 30 seconds and is bounded to 15 minutes. Long jobs
  must renew leases periodically rather than requesting unbounded ownership.
- Enqueue paths must be idempotent; retrying an API request with the same key
  returns the existing job instead of creating duplicate work.
- Production deployments run at least two workers per queue across zones to meet
  the 99.99% availability target.

## Security review checklist

- Payload schemas are explicit and validated before enqueue.
- Worker credentials can only claim authorized queues.
- Metrics, logs, traces, alerts, and dashboard labels exclude secrets and PII.
- Failed job errors are truncated and mapped to stable reason codes before
  leaving the worker runtime.
- Replay tooling requires an operator audit event and preserves the original
  idempotency key.

## Blue-green and canary deployment

1. Deploy green API and worker pods with claiming disabled.
2. Run migration checks and enqueue/claim smoke tests against a canary queue.
3. Enable green workers for 5% of queue traffic for 15 minutes.
4. Promote to 25%, 50%, and 100% only while claim P99 remains below 100 ms,
   availability stays at or above 99.99%, and lease expirations do not spike.
5. Roll back by disabling green claims; blue workers safely reclaim expired
   leases because completion uses `lock_version` compare-and-swap.

## Operator runbook

1. Check scheduler availability, claim latency P99, queue age, and expired lease
   rate in the dashboard.
2. If queue age exceeds the SLO, add workers only after claim latency remains
   healthy; otherwise investigate database contention first.
3. If expired leases spike, compare worker restarts, downstream dependency
   errors, and lease-renewal failures.
4. Disable the affected queue flag before replaying terminal failures.
5. After recovery, document the root cause and add a test or alert that would
   have caught the issue earlier.
