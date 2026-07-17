import { describe, expect, it, vi } from "vitest";
import { parseRetryAfter, TenantTokenBucketLimiter } from "@/lib/tenantRateLimiter";

function testClock() {
  let now = 0;
  const sleep = vi.fn(async (milliseconds: number) => {
    now += milliseconds;
  });
  return { clock: { now: () => now, sleep }, sleep, advance: (milliseconds: number) => { now += milliseconds; } };
}

describe("TenantTokenBucketLimiter", () => {
  it("keeps token consumption isolated per tenant", async () => {
    const { clock, sleep } = testClock();
    const limiter = new TenantTokenBucketLimiter(
      { capacity: 1, refillTokens: 1, refillIntervalMs: 1_000 },
      clock
    );

    await limiter.acquire("tenant-a");
    await limiter.acquire("tenant-b");

    expect(sleep).not.toHaveBeenCalled();
  });

  it("waits until a depleted bucket refills", async () => {
    const { clock, sleep } = testClock();
    const limiter = new TenantTokenBucketLimiter(
      { capacity: 2, refillTokens: 2, refillIntervalMs: 1_000 },
      clock
    );

    await limiter.acquire("tenant-a");
    await limiter.acquire("tenant-a");
    await limiter.acquire("tenant-a");

    expect(sleep).toHaveBeenCalledWith(500);
  });

  it("honors a server Retry-After cooldown", async () => {
    const { clock, sleep } = testClock();
    const limiter = new TenantTokenBucketLimiter(undefined, clock);
    limiter.block("tenant-a", 2_500);

    await limiter.acquire("tenant-a");

    expect(sleep).toHaveBeenCalledWith(2_500);
  });

  it("rejects invalid bucket configurations", () => {
    expect(() => new TenantTokenBucketLimiter({ capacity: 0, refillTokens: 1, refillIntervalMs: 1_000 })).toThrow(
      "Token bucket configuration"
    );
  });
});

describe("parseRetryAfter", () => {
  it("parses delta seconds and HTTP dates", () => {
    expect(parseRetryAfter("1.25")).toBe(1_250);
    expect(parseRetryAfter("Wed, 21 Oct 2015 07:28:00 GMT", Date.parse("Wed, 21 Oct 2015 07:27:58 GMT"))).toBe(2_000);
  });

  it("returns null for malformed values", () => {
    expect(parseRetryAfter("later")).toBeNull();
  });
});
