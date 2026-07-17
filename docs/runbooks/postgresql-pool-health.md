# Runbook: PostgreSQL pool health alerts

## Triage

1. Confirm whether the alert affects one pod, one deployment color, or all services using the same database.
2. Call the readiness endpoint from the service network. Treat a 503 as a dependency issue; do not expose its response outside operational access.
3. Inspect probe failures, latency EWMA, target connections, PostgreSQL connection count, database CPU, and network errors. Check the deployment version and recent configuration changes.
4. For a single unhealthy canary, remove it from traffic and roll back to blue. For fleet-wide failures, preserve capacity and escalate to the database on-call.

## Mitigation

- **Saturation:** increase `DB_POOL_MAX` only after verifying the database's connection budget across all replicas. Redeploy using the blue-green procedure; do not make an untracked live change.
- **Slow queries:** identify and fix the query/index issue. Pool growth cannot correct a slow database and may increase contention.
- **Authentication/network failure:** rotate or restore the secret/network policy, then restart one canary and verify two successful probes before promotion.
- **Missing configuration:** configure the server-side PostgreSQL pool factory; the service intentionally remains unready without it.

## Recovery verification

Require 15 minutes with no probe alert, readiness availability at or above 99.99% over the applicable window, and critical-path P99 below 100 ms before closing the incident. Record the root cause, mitigations, pool bounds, and follow-up owner in the incident timeline.
