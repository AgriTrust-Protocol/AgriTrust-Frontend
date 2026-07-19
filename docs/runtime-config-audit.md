# Runtime Configuration Auditing and Drift Detection

AgriTrust exposes a read-only runtime configuration audit for each frontend pod at
`GET /api/runtime-config/audit`. The endpoint audits only allow-listed variables,
redacts secret values, calculates a deterministic fingerprint, and returns `409`
when the live configuration drifts from `RUNTIME_CONFIG_BASELINE_FINGERPRINT` or
violates a validation rule.

## Architecture

1. CI/CD generates an approved baseline fingerprint for the target environment.
2. The deployment injects `RUNTIME_CONFIG_BASELINE_FINGERPRINT` into blue and
   green ReplicaSets.
3. Platform probes call `/api/runtime-config/audit` during canary analysis and
   block promotion when any `critical` drift is present.
4. `/api/metrics` exports Prometheus gauges for compliance and drift severity.

The audit is designed for critical paths under the 100 ms P99 target: it scans a
small allow-list once, avoids network calls, and never reads downstream services.

## Security and operations

- Never add secrets to public `NEXT_PUBLIC_*` variables.
- Mark server-side credentials as `secret: true` in `DEFAULT_RUNTIME_CONFIG_RULES`
  so API responses and metrics do not leak values.
- Security review is required before adding new rules, labels, or deployment
  variables.
- Alert when `agritrust_runtime_config_compliant == 0` or when critical drift is
  non-zero for more than one scrape interval.

## Blue-green and canary checklist

1. Deploy green with the approved baseline fingerprint and zero user traffic.
2. Scrape `/api/runtime-config/audit` and `/api/metrics` from green pods.
3. Shift 5% traffic only if compliance is `true` and critical drift is `0`.
4. Promote progressively while watching latency, error rate, and drift gauges.
5. Roll back immediately if configuration drift appears after promotion.
