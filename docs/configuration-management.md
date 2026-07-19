# Configuration management with hot reload

## Architecture

AgriTrust runtime configuration is owned by `ConfigManager`, which accepts a schema, an initial last-known-good configuration, and a reload source. The manager validates every candidate payload before publishing it to subscribers. Invalid payloads are rejected without replacing the active snapshot, preserving availability during bad rollouts.

The default runtime schema is intentionally allow-listed and contains only non-secret operational controls: schema version, deployment environment, blue/green release colour, capacity level, critical-path P99 target, and named feature flags. Do not put wallet addresses, account IDs, credentials, tokens, farm identifiers, or other PII/secrets in runtime configuration.

## Hot-reload flow

1. Deploy configuration changes to the inactive colour first.
2. The runtime calls `reload()` against the configured source.
3. The payload is schema-validated and feature flag names are checked for safe metric labels.
4. If validation succeeds, the manager increments the version and notifies subscribers synchronously.
5. If validation fails, the previous snapshot remains active and the validation failure callback emits telemetry/alerts.

Reload acceptance is designed for critical paths with a P99 target below 100 ms. Reload sources should use cached local reads or edge-local config endpoints; they must not block wallet signing or transaction submission.

## Monitoring and alerting

Emit these signals from the host service around reload attempts:

- `config_reload_duration_ms` histogram labelled by service, environment, release colour, and accepted status.
- `config_reload_failures_total` counter labelled by service, environment, release colour, and validation category.
- `config_snapshot_version` gauge labelled by service, environment, and release colour.
- `config_last_good_loaded_at` gauge containing the Unix timestamp of the current snapshot.

Alert when reload P99 is greater than or equal to 100 ms for five minutes, any production validation failure is observed, or active colours report mismatched snapshot versions for more than five minutes.

## Blue-green and canary rollout

Deploy schema changes backward-compatibly. Release the green application with support for both old and new config fields, then publish config to green with optional features disabled. Canary 5% of traffic for 15 minutes, then 25%, 50%, and 100% if critical-path P99 remains below 100 ms and validation failures stay at zero. Keep blue on the last-known-good configuration until rollback windows close.

## Runbook

1. Confirm whether failures are validation errors, source/network errors, or version skew.
2. Compare `config_snapshot_version` across blue and green.
3. Roll back to the previous configuration payload if production validation failures occur.
4. If latency breaches the 100 ms P99 target, switch reload source to a local cached endpoint and pause canary promotion.
5. Document the failed payload hash, owner, rollback time, and security review outcome.
