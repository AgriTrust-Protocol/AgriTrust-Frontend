import { describe, expect, it, vi } from "vitest";
import { JsonCache, createCacheFromEnv } from "../index";
import type { CacheStore } from "../redis";

function store(): CacheStore {
  const values = new Map<string, string>();
  return { get: vi.fn(async (key) => values.get(key) ?? null), set: vi.fn(async (key, value) => { values.set(key, value); }), delete: vi.fn(async (key) => { values.delete(key); }) };
}

describe("JsonCache", () => {
  it("uses a configured TTL and returns a JSON cache hit", async () => {
    const backend = store();
    const cache = new JsonCache(backend, { enabled: true, defaultTtlSeconds: 20, keyPrefix: "test" });
    const load = vi.fn(async () => ({ score: 92 }));
    await expect(cache.getOrSet("certification", "cert-1", load, { ttlSeconds: 60 })).resolves.toEqual({ score: 92 });
    await expect(cache.getOrSet("certification", "cert-1", load)).resolves.toEqual({ score: 92 });
    expect(load).toHaveBeenCalledTimes(1);
    expect(backend.set).toHaveBeenCalledWith("test:certification:cert-1", JSON.stringify({ score: 92 }), 60);
  });

  it("falls back to the source when Redis is unavailable", async () => {
    const backend: CacheStore = { get: vi.fn(async () => { throw new Error("down"); }), set: vi.fn(async () => { throw new Error("down"); }), delete: vi.fn(async () => undefined) };
    const report = vi.fn();
    const cache = new JsonCache(backend, { enabled: true, defaultTtlSeconds: 20, keyPrefix: "test" }, report);
    await expect(cache.getOrSet("audit", "audit-1", async () => "authoritative")).resolves.toBe("authoritative");
    expect(report).toHaveBeenCalledWith("error", expect.objectContaining({ namespace: "audit" }));
  });

  it("does not create a Redis client without complete credentials", () => {
    expect(() => createCacheFromEnv({ CACHE_DEFAULT_TTL_SECONDS: "0" })).toThrow("CACHE_DEFAULT_TTL_SECONDS");
    expect(() => createCacheFromEnv({ UPSTASH_REDIS_REST_URL: "https://redis.example" })).toThrow("configured together");
  });
});

describe("RedisRestStore", () => {
  it("uses authenticated no-store Redis commands", async () => {
    const { RedisRestStore } = await import("../redis");
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ result: "cached" }), { status: 200 }));
    const redis = new RedisRestStore("https://redis.example", "secret", fetcher);
    await expect(redis.get("key")).resolves.toBe("cached");
    expect(fetcher).toHaveBeenCalledWith("https://redis.example", expect.objectContaining({
      method: "POST", cache: "no-store", body: JSON.stringify(["GET", "key"]),
      headers: expect.objectContaining({ Authorization: "Bearer secret" }),
    }));
  });
});
