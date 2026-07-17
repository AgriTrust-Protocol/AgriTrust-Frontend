# Tracing operations runbook

## Trace export failure

1. Check the dashboard's export-failure panel and collector health/error logs.
2. Verify the configured endpoint is HTTPS, CORS permits the deployed frontend
   origin, and the collector accepts OTLP JSON at `/v1/traces`.
3. Verify collector credentials/relay policy without adding secrets to public
   `NEXT_PUBLIC_*` configuration.
4. If the collector is unavailable, leave the application running: tracing is
   fail-open. Disable the exporter variable only if browser network errors are
   causing material operational noise.

## Critical-path latency

1. Use a trace ID from the P99 panel to identify whether browser, API, RPC, or
   wallet work dominates; do not search trace attributes for user identifiers.
2. Compare the blue and green deployments plus the canary cohort before rollback.
3. Roll back the canary when P99 remains above 100ms for 10 minutes or error
   rate rises above the release SLO. Preserve collector data for incident review.

## Release procedure: blue-green with canary

1. Deploy the new frontend to **green** with its collector endpoint and trusted
   origins configured. Run a synthetic same-origin request and verify a complete
   frontend-to-service trace.
2. Route 5% of traffic to green for 15 minutes. Compare P99, error rate, and
   trace export failures with blue; promote only when all stay within SLO.
3. Increase to 25%, then 100%, with the same checks. Keep blue warm until the
   post-promotion observation window completes.
4. Roll traffic back to blue on alert. The code's bounded, fail-open queue means
   an observability outage cannot become an availability outage.
