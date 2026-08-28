/**
 * EndpointPool (issue #171)
 *
 * Tracks health for a fixed set of Soroban RPC endpoints and hands out a
 * healthy one round-robin. Health checks ping `${endpoint}/health` on an
 * interval; `markUnhealthy` lets the rate limiter demote an endpoint
 * immediately on a 429/error without waiting for the next scheduled ping.
 *
 * Zero external dependencies — timers via native `setTimeout`, requests
 * via native `fetch` + `AbortController`.
 */

import type { RpcEndpointStatus } from "@/src/types/rpc";
import { RPC_CONFIG } from "@/src/config/rpcEndpoints";

const HEALTH_CHECK_TIMEOUT_MS = 5_000;

export interface EndpointPoolOptions {
  healthCheckIntervalMs?: number;
  fetchImpl?: typeof fetch;
  /** Skip the initial/periodic network pings (unit tests drive health via markHealthy/markUnhealthy instead). */
  autoStart?: boolean;
}

export class EndpointPool {
  private readonly statuses: Map<string, RpcEndpointStatus>;
  private readonly order: string[];
  private readonly healthCheckIntervalMs: number;
  private readonly fetchImpl: typeof fetch;
  private cursor = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(endpoints: readonly string[], options: EndpointPoolOptions = {}) {
    if (endpoints.length < 1) {
      throw new Error("EndpointPool requires at least one endpoint");
    }
    this.order = [...endpoints];
    this.statuses = new Map(
      endpoints.map((url) => [
        url,
        { url, healthy: true, lastPing: 0, consecutiveFailures: 0 } satisfies RpcEndpointStatus,
      ])
    );
    this.healthCheckIntervalMs = options.healthCheckIntervalMs ?? RPC_CONFIG.healthCheckIntervalMs;
    this.fetchImpl = options.fetchImpl ?? fetch;

    if (options.autoStart ?? true) this.start();
  }

  /** Begins periodic health checks. Safe to call more than once (no-op if already running). */
  start(): void {
    if (this.timer) return;
    void this.healthCheck();
    this.timer = setInterval(() => void this.healthCheck(), this.healthCheckIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Pings every endpoint's `/health` route and updates status. Exposed for tests/manual triggers. */
  async healthCheck(): Promise<void> {
    await Promise.all(this.order.map((url) => this.pingOne(url)));
  }

  private async pingOne(url: string): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(`${url}/health`, { signal: controller.signal });
      this.setStatus(url, response.ok);
    } catch {
      this.setStatus(url, false);
    } finally {
      clearTimeout(timeout);
    }
  }

  private setStatus(url: string, healthy: boolean): void {
    const status = this.statuses.get(url);
    if (!status) return;
    status.lastPing = Date.now();
    status.healthy = healthy;
    status.consecutiveFailures = healthy ? 0 : status.consecutiveFailures + 1;
  }

  /** Immediately demotes an endpoint (e.g. on a 429) without waiting for the next scheduled ping. */
  markUnhealthy(url: string): void {
    this.setStatus(url, false);
  }

  markHealthy(url: string): void {
    this.setStatus(url, true);
  }

  /** Round-robins through endpoints currently marked healthy; null if none are. */
  getHealthyEndpoint(): string | null {
    for (let attempts = 0; attempts < this.order.length; attempts++) {
      const url = this.order[this.cursor];
      this.cursor = (this.cursor + 1) % this.order.length;
      if (this.statuses.get(url)?.healthy) return url;
    }
    return null;
  }

  getStatuses(): RpcEndpointStatus[] {
    return this.order.map((url) => ({ ...this.statuses.get(url)! }));
  }

  destroy(): void {
    this.stop();
  }
}
