# Graceful degradation and capacity shedding

## Architecture

The browser receives an **allow-listed, build-time feature configuration** from `NEXT_PUBLIC_FEATURE_*`. A `ResilienceProvider` combines those flags with `NEXT_PUBLIC_CAPACITY_LEVEL`, set by the deployment control plane, to gate optional work. The provider never gates wallet, authentication, transaction signing, or other core user actions.

| Capacity level | Behaviour |
| --- | --- |
| `normal` (default) | All enabled features run. |
| `constrained` | Circuit prewarming and service-worker registration are skipped. |
| `critical` | Also remove analytics and maps, including direct route content. |

The service-side load balancer and admission controls remain authoritative. This UI mechanism reduces client CPU, network, and rendering work; it must not be used as a security control. Invalid environment values fail to `normal`, and an unavailable capacity signal retains core functionality.

## Configuration and release

- `NEXT_PUBLIC_FEATURE_ANALYTICS`, `NEXT_PUBLIC_FEATURE_MAPS`, `NEXT_PUBLIC_FEATURE_ZKP_CIRCUIT_PRELOAD`, and `NEXT_PUBLIC_FEATURE_SERVICE_WORKER` accept `true` to enable; any other non-empty value disables the feature.
- Set `NEXT_PUBLIC_CAPACITY_LEVEL=constrained` or `critical` for an incident. Remove it (or set `normal`) to restore service.
- In blue-green releases, deploy the inactive colour with all flags off, run smoke tests for core wallet flows, then enable one flag at a time. Canary 5% of traffic for 15 minutes before 25%, 50%, and 100%; automatically halt or roll back on SLO breach.

## Monitoring and alerts

Emit `http_server_duration_ms` (histogram), `http_server_errors_total`, `feature_gate_state`, and `capacity_shedding_level` with release and colour labels. Dashboard p50/p95/p99 latency, error rate, availability, and traffic split by colour and feature gate.

Alert when critical-path P99 is >=100ms for 5 minutes, error rate is >=2% for 5 minutes, or availability drops below 99.99% over the rolling SLO window. Page immediately at >=500ms P99 or >=10% errors. Alert routing must not contain account, wallet, farm, or transaction identifiers.

## Incident runbook

1. Confirm the alert against the canary and active colour dashboards; check upstream dependencies and error budget.
2. Set `NEXT_PUBLIC_CAPACITY_LEVEL=constrained`; validate core wallet and authentication flows and watch P99 for five minutes.
3. If the SLO remains breached, set it to `critical`, pause canary promotion, and scale/roll back server capacity as appropriate.
4. Record level changes, timestamps, release ID, and measured impact. Restore `normal` only after 15 stable minutes, then re-enable optional flags one at a time.
5. Security review must approve new flags, telemetry fields, and deployment configuration before release. Do not place secrets or PII in public environment variables or telemetry labels.
