/**
 * Static Soroban RPC endpoint pool + tunable defaults for the rate-limiting
 * middleware (issue #171). Override any endpoint via env var without a
 * code change; falls back to public endpoints so local dev works out of
 * the box.
 */

export const RPC_ENDPOINTS: readonly string[] = [
  process.env.NEXT_PUBLIC_SOROBAN_RPC_PRIMARY || "https://soroban-testnet.stellar.org",
  process.env.NEXT_PUBLIC_SOROBAN_RPC_FALLBACK_1 || "https://rpc-futurenet.stellar.org",
  process.env.NEXT_PUBLIC_SOROBAN_RPC_FALLBACK_2 || "https://soroban-rpc.creit.tech",
];

export const RPC_CONFIG = {
  /** Token-bucket capacity / refill rate, per endpoint. Runtime-configurable via RpcRateLimiter options. */
  defaultRateLimitPerSecond: 10,
  /** How often endpointPool pings each endpoint's health check. */
  healthCheckIntervalMs: 30_000,
  /** Total budget (queue wait + all retries) before a queued request is rejected. */
  requestTimeoutMs: 10_000,
  backoff: {
    baseMs: 1_000,
    maxMs: 8_000,
    factor: 2,
  },
} as const;
