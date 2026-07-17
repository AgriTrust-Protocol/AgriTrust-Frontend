import { readCacheConfig, type CacheConfig } from "./config";
import { RedisRestStore, type CacheStore } from "./redis";

export type CacheEvent = "hit" | "miss" | "write" | "error";
export type CacheReporter = (event: CacheEvent, details: { namespace: string; durationMs: number }) => void;

export interface CacheOptions { ttlSeconds?: number; }

/**
 * Server-side read-through JSON cache. Cache failures are deliberately non-fatal:
 * critical requests continue to their source of truth while an error is reported.
 */
export class JsonCache {
  constructor(
    private readonly store: CacheStore | null,
    private readonly config: Pick<CacheConfig, "enabled" | "defaultTtlSeconds" | "keyPrefix">,
    private readonly report: CacheReporter = () => undefined,
  ) {}

  async getOrSet<T>(namespace: string, id: string, loader: () => Promise<T>, options: CacheOptions = {}): Promise<T> {
    const ttlSeconds = options.ttlSeconds ?? this.config.defaultTtlSeconds;
    this.validate(namespace, id, ttlSeconds);
    if (!this.config.enabled || !this.store) return loader();

    const key = `${this.config.keyPrefix}:${namespace}:${id}`;
    const startedAt = Date.now();
    try {
      const cached = await this.store.get(key);
      if (cached !== null) {
        this.report("hit", { namespace, durationMs: Date.now() - startedAt });
        return JSON.parse(cached) as T;
      }
      this.report("miss", { namespace, durationMs: Date.now() - startedAt });
    } catch {
      this.report("error", { namespace, durationMs: Date.now() - startedAt });
    }

    const value = await loader();
    const writeStartedAt = Date.now();
    try {
      await this.store.set(key, JSON.stringify(value), ttlSeconds);
      this.report("write", { namespace, durationMs: Date.now() - writeStartedAt });
    } catch {
      this.report("error", { namespace, durationMs: Date.now() - writeStartedAt });
    }
    return value;
  }

  async invalidate(namespace: string, id: string): Promise<void> {
    this.validate(namespace, id, this.config.defaultTtlSeconds);
    if (!this.config.enabled || !this.store) return;
    const startedAt = Date.now();
    try {
      await this.store.delete(`${this.config.keyPrefix}:${namespace}:${id}`);
    } catch {
      this.report("error", { namespace, durationMs: Date.now() - startedAt });
    }
  }

  private validate(namespace: string, id: string, ttlSeconds: number): void {
    if (!/^[a-zA-Z0-9:_-]{1,80}$/.test(namespace) || !/^[a-zA-Z0-9._:-]{1,200}$/.test(id)) {
      throw new Error("Cache namespace and id contain unsupported characters");
    }
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 86_400) {
      throw new Error("Cache TTL must be an integer between 1 and 86400 seconds");
    }
  }
}

/** Creates the application cache from server-only environment variables. */
export function createCacheFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  reporter?: CacheReporter,
): JsonCache {
  const config = readCacheConfig(env);
  const store = config.redisUrl && config.redisToken
    ? new RedisRestStore(config.redisUrl, config.redisToken)
    : null;
  return new JsonCache(store, config, reporter);
}
