# Redis cache layer

## Architecture

Server-side services use `JsonCache` for read-through caching: it checks Redis, calls the authoritative service on a miss, then stores the JSON response with an explicit TTL. Redis is never accessed by browser code and its credentials must never use a `NEXT_PUBLIC_` prefix. Cache keys are namespaced as `<CACHE_KEY_PREFIX>:<namespace>:<id>`; callers must use opaque, non-sensitive IDs. Do not cache user sessions, bearer tokens, wallet secrets, or authorization-dependent responses unless the key includes the authorization boundary and has passed security review.

The Redis adapter uses the TLS REST API so it is suitable for serverless Next.js deployments without connection pooling. A Redis error is recorded and treated as a cache miss; the request continues to its source of truth. This preserves availability during a cache incident, though origin capacity must be provisioned for that fallback.

```ts
const cache = createCacheFromEnv();
const certification = await cache.getOrSet(
  "certification",
  certificationId,
  () => certificationService.get(certificationId),
  { ttlSeconds: 120 },
);
```

Invalidate the same namespace/id immediately after a successful mutation:

```ts
await cache.invalidate("certification", certificationId);
```

## Configuration

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `CACHE_ENABLED` | No | `true` | Set to `false` to bypass all cache reads and writes. |
| `CACHE_DEFAULT_TTL_SECONDS` | No | `300` | Integer from 1 through 86,400. |
| `CACHE_KEY_PREFIX` | No | `agritrust` | Environment/tenant-safe key prefix. |
| `UPSTASH_REDIS_REST_URL` | Together with token | — | Redis TLS REST endpoint. |
| `UPSTASH_REDIS_REST_TOKEN` | Together with URL | — | Redis REST bearer token, held only in server secret storage. |

When Redis credentials are absent, the cache safely bypasses Redis. Use that mode only for local development or a deliberate incident mitigation; production should alert on it.

## Monitoring and alerting

Provide a `CacheReporter` when constructing the cache to emit `hit`, `miss`, `write`, and `error` events. Record event count and `durationMs` as `cache_operations_total` and `cache_operation_duration_ms`, labeled only by event and namespace (never keys or IDs). Derive cache-hit ratio as `hit / (hit + miss)`.

Recommended production alerts:

- **Cache availability:** `cache_operations_total{event="error"}` exceeds 1% of operations for five minutes (page); any sustained error rate increases origin load.
- **Cache effectiveness:** hit ratio below 70% for 15 minutes (ticket); investigate TTL/key churn before changing TTL.
- **Critical-path latency:** P99 cache operation duration above 25 ms for five minutes (page) to retain the <100 ms end-to-end budget.
- **Redis capacity:** alert on provider memory above 80%, evictions above zero, and command errors; wire these provider metrics into the same dashboard.

Dashboard panels: operation/error rate, hit ratio by namespace, cache operation P50/P95/P99, Redis memory/evictions, and origin latency/error rate. Correlate cache errors with origin saturation during incident response.

## Deployment and rollback

1. Deploy the code with `CACHE_ENABLED=false` in the green environment and verify source-of-truth correctness.
2. Add Redis URL/token as server secrets, deploy green, and enable cache for a 5% canary. Verify error rate, P99, hit ratio, and authorization behavior for at least 30 minutes.
3. Progress canary to 25%, 50%, then 100% only if the alerts above remain clear; retain the prior blue environment until rollback window closes.
4. Roll back immediately by setting `CACHE_ENABLED=false`. This requires no data migration and does not affect authoritative data. Rotate the Redis token if it is suspected exposed.

## Runbook

**High Redis errors:** set `CACHE_ENABLED=false`, confirm origin capacity/latency, check provider health and token validity, then re-enable first in a canary.

**Stale data:** invalidate the namespace/id after the mutation, verify callers use the same key, and only then consider shortening its TTL. Do not flush the entire Redis database unless incident command approves it.

**Security event:** disable caching, rotate Redis credentials, audit cache reporters/logs for accidental key/value emission, and perform a security review before re-enabling.
