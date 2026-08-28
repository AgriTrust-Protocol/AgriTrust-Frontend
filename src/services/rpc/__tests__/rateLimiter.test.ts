// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { EndpointPool } from "../endpointPool";
import { RpcRateLimiter } from "../rateLimiter";
import { Priority, RpcTimeoutError } from "@/src/types/rpc";

const ENDPOINTS = ["https://a.example", "https://b.example", "https://c.example"];

function makePool(fetchImpl: typeof fetch) {
  return new EndpointPool(ENDPOINTS, { autoStart: false, fetchImpl });
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 429 ? "Too Many Requests" : "OK",
    json: async () => body,
  } as Response;
}

describe("RpcRateLimiter (issue #171)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("dispatches higher-priority (lower number) requests first", async () => {
    vi.useFakeTimers();
    const dispatchOrder: Priority[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      const priority = Number(new URL(url, "https://a.example").searchParams.get("p"));
      dispatchOrder.push(priority);
      return jsonResponse({ ok: true });
    }) as unknown as typeof fetch;

    const pool = makePool(fetchImpl);
    const limiter = new RpcRateLimiter({ pool, ratePerSecond: 1, fetchImpl });

    // Exhaust the single starting token first so all three land in the queue together.
    limiter.enqueue({ path: "/warmup" }, Priority.Analytics);
    await vi.advanceTimersByTimeAsync(0);

    const analytics = limiter.enqueue({ path: "/x?p=3" }, Priority.Analytics);
    const write = limiter.enqueue({ path: "/x?p=1" }, Priority.Write);
    const read = limiter.enqueue({ path: "/x?p=2" }, Priority.Read);

    await vi.advanceTimersByTimeAsync(3_000);
    await Promise.all([analytics, write, read]);

    expect(dispatchOrder.slice(-3)).toEqual([1, 2, 3]);
  });

  it("rejects with RpcTimeoutError when the deadline elapses with no healthy endpoint", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    const pool = makePool(fetchImpl);
    ENDPOINTS.forEach((url) => pool.markUnhealthy(url));

    const limiter = new RpcRateLimiter({ pool, requestTimeoutMs: 10_000, fetchImpl });
    const promise = limiter.enqueue({ path: "/x" }, Priority.Read);

    const assertion = expect(promise).rejects.toBeInstanceOf(RpcTimeoutError);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  it("on a 429, marks the endpoint unhealthy and rotates to the next one", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      return url.startsWith(ENDPOINTS[0]) ? jsonResponse({}, 429) : jsonResponse({ ok: true });
    });
    const pool = makePool(fetchImpl as unknown as typeof fetch);

    const limiter = new RpcRateLimiter({
      pool,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoff: { baseMs: 1_000, maxMs: 8_000, factor: 2 },
    });

    const promise = limiter.enqueue({ path: "/x" }, Priority.Read);
    await vi.advanceTimersByTimeAsync(0); // first attempt hits endpoint 0 -> 429
    expect(pool.getStatuses().find((s) => s.url === ENDPOINTS[0])?.healthy).toBe(false);

    await vi.advanceTimersByTimeAsync(1_000); // backoff elapses, retries against a healthy endpoint
    await expect(promise).resolves.toEqual({ ok: true });
  });

  it("applies exponential backoff (1s, then 2s) across repeated 429s", async () => {
    vi.useFakeTimers();
    let call = 0;
    const fetchImpl = vi.fn().mockImplementation(async () => {
      call += 1;
      // Fail on the first two (round-robin) endpoints only, leaving the
      // third healthy — with just 3 endpoints in the pool, failing on all
      // three would exhaust it and the request could never succeed.
      return call <= 2 ? jsonResponse({}, 429) : jsonResponse({ ok: true });
    });
    const pool = makePool(fetchImpl as unknown as typeof fetch);
    const limiter = new RpcRateLimiter({
      pool,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      requestTimeoutMs: 30_000,
    });

    const promise = limiter.enqueue({ path: "/x" }, Priority.Read);

    await vi.advanceTimersByTimeAsync(0); // attempt 1 (endpoint A) -> 429
    expect(call).toBe(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(call).toBe(1); // 1s backoff not elapsed yet
    await vi.advanceTimersByTimeAsync(1); // 1s elapsed -> attempt 2 (endpoint B) -> 429
    expect(call).toBe(2);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(call).toBe(2); // 2s backoff not elapsed yet
    await vi.advanceTimersByTimeAsync(1); // 2s elapsed -> attempt 3 (endpoint C) -> succeeds
    expect(call).toBe(3);
    await expect(promise).resolves.toEqual({ ok: true });
  });

  it("queueDepth reflects requests waiting for a token", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const pool = makePool(fetchImpl as unknown as typeof fetch);
    const limiter = new RpcRateLimiter({ pool, ratePerSecond: 1, fetchImpl: fetchImpl as unknown as typeof fetch });

    limiter.enqueue({ path: "/1" }, Priority.Read);
    limiter.enqueue({ path: "/2" }, Priority.Read);
    limiter.enqueue({ path: "/3" }, Priority.Read);

    expect(limiter.queueDepth).toBeGreaterThan(0);
  });
});
