# Per-tenant API rate limiting

## Scope and security boundary

Every API service must enforce the same quota at the edge, before executing
business logic. The browser's limiter is only a cooperative UX measure; it is
not a security control. The gateway derives `tenant_id` from a verified JWT or
the authenticated service principal, never from a request header, URL segment,
or client-provided claim. Anonymous endpoints use a separately configured
bucket keyed by a privacy-preserving IP-prefix and endpoint class.

The gateway returns `429 Too Many Requests` with `Retry-After`,
`X-RateLimit-Limit`, `X-RateLimit-Remaining`, and
`X-RateLimit-Reset`. The web client consumes `Retry-After`, locally pauses only
that session's tenant partition, and exposes an `ApiRateLimitError` to the UI.
It does not automatically replay mutations, preventing duplicate writes.

## Architecture

```text
Browser -> CDN/WAF -> API gateway -> tenant token-bucket check -> services
                              |                 |
                              |                 +-> Redis primary/replica
                              +-> metrics/traces     (atomic Lua operation)
```

* **Policy source:** versioned tenant plans live in the control-plane database
  and are propagated to gateway instances. Plans include `capacity`,
  `refill_tokens`, `refill_interval_ms`, and optional endpoint cost.
* **State:** Redis stores one key per `(environment, tenant_id, policy_version,
  endpoint_class)`, with a TTL no longer than two refill windows. Redis Cluster
  hash-tags keep a bucket's fields co-located.
* **Atomicity:** a Lua script uses Redis `TIME`, refills fractional tokens,
  consumes the endpoint cost if available, and returns remaining tokens and the
  next eligible time in one operation. Gateway clocks are not used for bucket
  mutation.
* **Failure mode:** limit critical write endpoints **closed** when Redis is
  unavailable; limit read-only/public endpoints with a small in-process
  emergency bucket and emit a `rate_limit_degraded` event. Never fail open for
  authentication, payment, wallet, or mutation routes.

The request-path budget is one Redis script execution and one metrics counter;
it has no synchronous control-plane call. Load-test the script and gateway at
at least twice peak load, and promote only if gateway-to-upstream P99 stays
below 100 ms.

## Required metrics, dashboard, and alerts

Emit low-cardinality metrics labelled by `service`, `route_class`, `plan`,
`outcome`, and `policy_version`—not raw tenant IDs:

* `api_rate_limit_decisions_total` (allowed, denied, degraded)
* `api_rate_limit_remaining_tokens` histogram
* `api_rate_limit_redis_latency_seconds` histogram
* `http_server_request_duration_seconds` histogram and `http_requests_total`
* `api_rate_limit_policy_load_failures_total`

The **Rate Limiting** dashboard contains: allowed/denied ratio by route class,
429 rate by plan, gateway and Redis P50/P95/P99 latency, degraded-mode count,
top tenants through a restricted drill-down, and policy-version distribution.

Page the on-call engineer when any five-minute window has: critical-route P99
above 100 ms, denied requests above 5% with a 3x baseline increase, any
degraded-mode decision for critical endpoints, or Redis script error rate above
0.1%. Create a ticket (not a page) for sustained 80% quota utilization or an
unexpected policy-version skew. Alerts must link to the dashboard and runbook.

## Blue-green rollout and canary

1. Deploy the new gateway configuration to **green** with enforcement in
   shadow mode. Log would-be decisions and compare them with blue for 24 hours.
2. Run synthetic tests for tenant isolation, fractional refill, expiry, Redis
   failover, and forged tenant headers. Run the performance suite at 2x peak.
3. Send 1% of authenticated traffic to green with enforcement enabled; hold for
   30 minutes. Promote to 10%, 25%, 50%, then 100% only if P99 is under 100 ms,
   critical 429 rate does not exceed baseline by 1%, and error budget impact is
   below 0.01%.
4. Keep blue warm and preserve the previous policy version. Roll back traffic
   immediately on a canary breach; do not delete Redis keys during rollback.
5. After 24 hours at 100%, retire blue and retain shadow-decision logs for the
   security review window.

## On-call runbook

**Unexpected 429s:** verify the tenant plan and policy version, inspect the
restricted tenant drill-down, then confirm route cost and retry headers. Apply
a time-bounded plan override through the audited control plane—never alter a
Redis key manually.

**Redis degradation:** determine whether the endpoint is fail-closed or using
the emergency read bucket. Fail over Redis, verify script latency and error
rate, then remove degraded mode only after a stable 15-minute window.

**Suspected abuse:** preserve request IDs and trace samples, engage security,
and apply a narrowly scoped gateway/WAF rule. Do not expose tenant identifiers
or quota details in public logs.

## Verification checklist

Security review must confirm trusted tenant derivation, key isolation, atomic
consumption, constrained metric labels, audited overrides, and no automatic
replay of non-idempotent client requests. The release requires unit,
integration, failover, load, and canary evidence attached to the deployment
record.
