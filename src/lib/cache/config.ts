/** Server-side cache configuration. Do not prefix these variables with NEXT_PUBLIC_. */
export interface CacheConfig {
  enabled: boolean;
  defaultTtlSeconds: number;
  keyPrefix: string;
  redisUrl?: string;
  redisToken?: string;
}

const MIN_TTL_SECONDS = 1;
const MAX_TTL_SECONDS = 86_400;

function readTtl(value: string | undefined): number {
  if (value === undefined || value === "") return 300;
  const ttl = Number(value);
  if (!Number.isInteger(ttl) || ttl < MIN_TTL_SECONDS || ttl > MAX_TTL_SECONDS) {
    throw new Error(`CACHE_DEFAULT_TTL_SECONDS must be an integer between ${MIN_TTL_SECONDS} and ${MAX_TTL_SECONDS}`);
  }
  return ttl;
}

function readPrefix(value: string | undefined): string {
  const prefix = value ?? "agritrust";
  if (!/^[a-zA-Z0-9:_-]{1,80}$/.test(prefix)) {
    throw new Error("CACHE_KEY_PREFIX may only contain letters, numbers, colon, underscore, or hyphen");
  }
  return prefix;
}

export function readCacheConfig(env: NodeJS.ProcessEnv = process.env): CacheConfig {
  const redisUrl = env.UPSTASH_REDIS_REST_URL;
  const redisToken = env.UPSTASH_REDIS_REST_TOKEN;
  if (Boolean(redisUrl) !== Boolean(redisToken)) {
    throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured together");
  }

  return {
    enabled: env.CACHE_ENABLED !== "false",
    defaultTtlSeconds: readTtl(env.CACHE_DEFAULT_TTL_SECONDS),
    keyPrefix: readPrefix(env.CACHE_KEY_PREFIX),
    redisUrl,
    redisToken,
  };
}
