# Browser distributed tracing

The frontend emits OpenTelemetry Protocol (OTLP) JSON spans and uses the W3C
[`traceparent`](https://www.w3.org/TR/trace-context/) header for every browser
`fetch` to a trusted service. This lets collector-backed backend spans join the
same trace without exposing application payloads.

## Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Production | HTTPS OTLP/HTTP traces endpoint, for example `https://otel.example/v1/traces`. |
| `NEXT_PUBLIC_TRACE_PROPAGATION_ORIGINS` | For cross-origin APIs | Comma-separated HTTPS origins permitted to receive trace headers. Same-origin requests are always eligible. |

Do not configure a collector URL with credentials or query-string secrets. The
collector must allow the production frontend origin via CORS, accept
`application/json`, and authenticate at the edge (for example by mTLS from a
same-origin telemetry relay). A missing or unreachable collector never blocks a
user request; spans are bounded to 200 in memory and failed exports are dropped.

## Data and security contract

The instrumentation records method, origin/path, status code, duration, and
error class only. It deliberately excludes request/response bodies, query
strings, wallet addresses, account identifiers, and exception messages. Header
propagation is allow-listed, preventing trace headers from being sent to plugin,
RPC, or untrusted third-party URLs.

## Operations

Import `dashboards/agritrust-frontend-tracing.json` into Grafana and load
`alerts/frontend-tracing-rules.yaml` in Prometheus-compatible alerting. See the
[runbook](runbook.md) for alert response and the blue-green/canary release plan.


## SLO monitoring and burn-rate alerts

The production SLO is measured at the service-mesh boundary: 99.99% availability
with a 0.01% error budget and critical-path P99 latency below 100ms. Prometheus
recording rules in `deploy/observability/monitoring.yaml` calculate normalized
burn rates for 5m, 30m, 1h, 2h, 6h, and 1d windows. Page-level alerts require
both a short and long window to exceed the configured threshold, which catches
real incidents while suppressing single-scrape noise.

Import `deploy/observability/dashboard.json` for request rate, burn rate, P99
latency, error-ratio, and blue-green/canary readiness panels. See
`docs/architecture/slo-monitoring.md` for design details and
`docs/runbooks/slo-burn-rate.md` for response steps.
