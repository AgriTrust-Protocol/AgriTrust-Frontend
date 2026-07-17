/**
 * A small, client-side token bucket used to smooth requests made by this web
 * application. The API gateway remains the authoritative rate-limit enforcer:
 * do not use a browser-provided tenant identifier for authorization or quota
 * accounting.
 */

export interface TokenBucketConfig {
  capacity: number;
  refillTokens: number;
  refillIntervalMs: number;
}

interface BucketState {
  tokens: number;
  lastRefillMs: number;
  blockedUntilMs: number;
}

export interface RateLimitClock {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

const defaultClock: RateLimitClock = {
  now: () => Date.now(),
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

export const DEFAULT_TENANT_RATE_LIMIT: TokenBucketConfig = {
  capacity: 30,
  refillTokens: 30,
  refillIntervalMs: 1_000,
};

function validateConfig(config: TokenBucketConfig): void {
  if (
    !Number.isFinite(config.capacity) ||
    !Number.isFinite(config.refillTokens) ||
    !Number.isFinite(config.refillIntervalMs) ||
    config.capacity <= 0 ||
    config.refillTokens <= 0 ||
    config.refillIntervalMs <= 0
  ) {
    throw new Error("Token bucket configuration values must be positive finite numbers");
  }
}

/**
 * Maintains isolated buckets by tenant key and waits only when a bucket has no
 * token. Bucket mutation happens synchronously before awaiting, which makes
 * concurrent calls consume distinct tokens in a single JS runtime.
 */
export class TenantTokenBucketLimiter {
  private readonly buckets = new Map<string, BucketState>();

  constructor(
    private readonly config: TokenBucketConfig = DEFAULT_TENANT_RATE_LIMIT,
    private readonly clock: RateLimitClock = defaultClock
  ) {
    validateConfig(config);
  }

  async acquire(tenantKey: string): Promise<void> {
    const key = tenantKey || "anonymous";

    while (true) {
      const now = this.clock.now();
      const bucket = this.getBucket(key, now);
      this.refill(bucket, now);

      if (bucket.blockedUntilMs > now) {
        await this.clock.sleep(bucket.blockedUntilMs - now);
        continue;
      }

      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return;
      }

      const millisecondsPerToken = this.config.refillIntervalMs / this.config.refillTokens;
      const waitMs = Math.max(1, Math.ceil((1 - bucket.tokens) * millisecondsPerToken));
      await this.clock.sleep(waitMs);
    }
  }

  /** Applies a server-authoritative Retry-After delay to one tenant bucket. */
  block(tenantKey: string, retryAfterMs: number): void {
    if (!Number.isFinite(retryAfterMs) || retryAfterMs <= 0) return;

    const now = this.clock.now();
    const bucket = this.getBucket(tenantKey || "anonymous", now);
    bucket.blockedUntilMs = Math.max(bucket.blockedUntilMs, now + retryAfterMs);
  }

  reset(tenantKey?: string): void {
    if (tenantKey === undefined) {
      this.buckets.clear();
      return;
    }
    this.buckets.delete(tenantKey || "anonymous");
  }

  private getBucket(tenantKey: string, now: number): BucketState {
    const existing = this.buckets.get(tenantKey);
    if (existing) return existing;

    const bucket = {
      tokens: this.config.capacity,
      lastRefillMs: now,
      blockedUntilMs: 0,
    };
    this.buckets.set(tenantKey, bucket);
    return bucket;
  }

  private refill(bucket: BucketState, now: number): void {
    const elapsed = Math.max(0, now - bucket.lastRefillMs);
    if (elapsed === 0) return;

    const refill = (elapsed / this.config.refillIntervalMs) * this.config.refillTokens;
    bucket.tokens = Math.min(this.config.capacity, bucket.tokens + refill);
    bucket.lastRefillMs = now;
  }
}

export function parseRetryAfter(retryAfter: string | null, now = Date.now()): number | null {
  if (!retryAfter) return null;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);

  const retryAt = Date.parse(retryAfter);
  if (Number.isNaN(retryAt)) return null;
  return Math.max(0, retryAt - now);
}
