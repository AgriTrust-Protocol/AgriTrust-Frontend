# PostgreSQL pool health probe and adaptive sizing

## Architecture

`AdaptivePostgresPool` is the only process-local owner of the PostgreSQL pool. Every readiness request executes `SELECT 1` through the active pool with a 75 ms default deadline. A successful response is **ok**; the first failed or timed-out probe is **degraded** and the second consecutive failure is **down**. This avoids withdrawing a pod on an isolated transient failure while still ensuring failed dependencies are removed quickly.

The probe tracks pool saturation (`waiting > 0`, or no idle connections at the target), latency EWMA, and consecutive failures. Saturation or a slow probe grows capacity by two connections after a 30-second cooldown. Sustained idle capacity with healthy latency shrinks it after a five-minute cooldown. Bounds are controlled by `DB_POOL_MIN`, `DB_POOL_INITIAL`, and `DB_POOL_MAX` (defaults 2/5/20). Pool resizing uses replacement-and-drain: a new `pg.Pool` becomes active before the previous pool is ended. This is safe because `Pool#end` waits for checked-out work.

The health response intentionally excludes connection strings, usernames, server versions, and error text. The metrics endpoint must be protected by ingress or platform authentication; it is not an end-user endpoint.

## Endpoints and monitoring

- `GET /api/health/database` is the database readiness probe. It returns 200 only for `ok`, uses `Cache-Control: no-store`, and returns 503 for `degraded`, `down`, or missing configuration.
- `GET /api/metrics` exposes Prometheus counters/gauges: probe total, probe failures, target connections, and probe latency EWMA.

Create a dashboard with probe failure rate, readiness availability, EWMA/P99 latency, target size, and deployment version. Alert when either (a) probe failure rate exceeds 1% for 5 minutes, (b) a pod remains `down` for 2 minutes, or (c) probe latency exceeds 75 ms for 5 minutes. Page only after the alert is observed in two consecutive evaluation windows to avoid transient database/network noise.

## Blue-green deployment and canary

1. Ship the green release with a server-side `__agritrustPgPoolFactory` bootstrap (wrapping the approved PostgreSQL driver) and capacity bounds configured, but no traffic.
2. Verify `/api/health/database` returns 200 and scrape metrics for at least 10 minutes.
3. Send 5% traffic to green for 15 minutes; promote only when error rate, critical-path P99, and database probe failure rate do not regress. The critical path budget is below 100 ms P99.
4. Increase traffic in 25% steps, pausing at each step for the same checks. Keep blue available for immediate rollback.
5. Roll back routing if readiness becomes `down`, probe failures exceed 1%, or critical-path P99 breaches 100 ms. Do not alter pool limits during an incident without recording the change.
