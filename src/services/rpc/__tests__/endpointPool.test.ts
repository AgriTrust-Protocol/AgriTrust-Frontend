// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { EndpointPool } from "../endpointPool";

const ENDPOINTS = ["https://a.example", "https://b.example", "https://c.example"];

describe("EndpointPool (issue #171)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("round-robins across healthy endpoints", () => {
    const pool = new EndpointPool(ENDPOINTS, { autoStart: false });
    const seen = [pool.getHealthyEndpoint(), pool.getHealthyEndpoint(), pool.getHealthyEndpoint()];
    expect(seen).toEqual(ENDPOINTS);
    pool.destroy();
  });

  it("skips endpoints marked unhealthy", () => {
    const pool = new EndpointPool(ENDPOINTS, { autoStart: false });
    pool.markUnhealthy(ENDPOINTS[0]);
    pool.markUnhealthy(ENDPOINTS[1]);
    expect(pool.getHealthyEndpoint()).toBe(ENDPOINTS[2]);
    expect(pool.getHealthyEndpoint()).toBe(ENDPOINTS[2]);
    pool.destroy();
  });

  it("returns null when every endpoint is unhealthy", () => {
    const pool = new EndpointPool(ENDPOINTS, { autoStart: false });
    ENDPOINTS.forEach((url) => pool.markUnhealthy(url));
    expect(pool.getHealthyEndpoint()).toBeNull();
    pool.destroy();
  });

  it("healthCheck marks an endpoint healthy again on a 200 /health response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const pool = new EndpointPool(ENDPOINTS, { autoStart: false, fetchImpl });
    pool.markUnhealthy(ENDPOINTS[0]);

    await pool.healthCheck();

    expect(fetchImpl).toHaveBeenCalledWith(`${ENDPOINTS[0]}/health`, expect.any(Object));
    expect(pool.getStatuses().find((s) => s.url === ENDPOINTS[0])?.healthy).toBe(true);
    pool.destroy();
  });

  it("healthCheck marks an endpoint unhealthy on a network error", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const pool = new EndpointPool(ENDPOINTS, { autoStart: false, fetchImpl });

    await pool.healthCheck();

    expect(pool.getStatuses().every((s) => s.healthy === false)).toBe(true);
    pool.destroy();
  });

  it("pings on the configured interval when started", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const pool = new EndpointPool(ENDPOINTS, { fetchImpl, healthCheckIntervalMs: 30_000 });

    await vi.advanceTimersByTimeAsync(0); // flush the initial ping
    expect(fetchImpl).toHaveBeenCalledTimes(ENDPOINTS.length);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchImpl).toHaveBeenCalledTimes(ENDPOINTS.length * 2);

    pool.destroy();
    vi.useRealTimers();
  });
});
