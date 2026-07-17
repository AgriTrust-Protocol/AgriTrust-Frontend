# Structured logging architecture

## Scope and data model

The frontend emits JSON records that follow the OpenTelemetry Logs data model. Every record contains a resource (`service.name`, `service.version`, `deployment.environment.name`), a severity, a short event body, and semantic-convention attributes. HTTP events use `http.request.method`, `http.response.status_code`, `url.full`, and `server.address`; Web Vitals use `webvital.name`, `webvital.value`, and `webvital.rating`.

The browser forwards records to `NEXT_PUBLIC_OTEL_LOGS_ENDPOINT` as `{ "resourceLogs": [...] }`. The collector is responsible for OTLP conversion, retention, routing, and dashboard storage. When no endpoint is configured, production logging is a no-op; development emits the structured record to the console. This prevents an unavailable observability backend from affecting the user path.

## Privacy and security

The logger redacts attribute keys that can contain credentials or identity material, including tokens, cookies, wallet addresses, private keys, and passwords. It does not log request or response bodies, authorization headers, query strings, or error stacks. Strings, arrays, and nested objects are bounded to keep payloads safe and predictable. Add only approved low-cardinality, non-sensitive attributes.

## Correlation and operations

Services should preserve the W3C `traceparent` response header and pass it to `parseTraceparent` when trace correlation is available. Log volume and collector delivery failures should be monitored at the collector because browser fire-and-forget delivery intentionally never blocks rendering or transactions.

### Dashboard and alerts

Create a dashboard with request error rate (`severityText=ERROR` grouped by `http.response.status_code`), P95 request duration, Core Web Vitals by rating, and collector accepted/dropped logs. Alert on a five-minute HTTP error rate above 1%, collector dropped logs above 0.1%, or P99 critical-path duration above 100 ms for 10 minutes. Route alerts to the on-call channel and link the operational runbook.

### Blue-green and canary deployment

1. Deploy the collector endpoint and dashboards before enabling the frontend environment variable.
2. Release the green frontend with `NEXT_PUBLIC_OTEL_LOGS_ENDPOINT` to a 5% canary.
3. Compare error rate, P99 latency, and dropped-log ratio with blue for at least 30 minutes.
4. Promote only when all thresholds remain within baseline; otherwise remove the endpoint variable or route traffic back to blue. The logger's non-blocking transport makes rollback immediate and avoids availability impact.
5. Verify the first production records contain the expected service resource and no redacted values are present in raw logs.
