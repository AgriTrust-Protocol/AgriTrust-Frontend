/**
 * Soroban RPC client (issue #171).
 *
 * Note: the issue's codebase navigation guide describes this as an
 * "existing" file — it wasn't actually present in the repo, so this is a
 * fresh implementation built to be the thing rateLimiter/endpointPool
 * plug into, rather than a refactor of prior code.
 *
 * All requests funnel through a shared `RpcRateLimiter`, so callers never
 * touch `fetch` or a specific endpoint URL directly — throttling, queueing,
 * retry/backoff, and endpoint rotation are all handled underneath
 * `request()`.
 */

import { EndpointPool } from "./endpointPool";
import { RpcRateLimiter } from "./rateLimiter";
import { Priority, type RpcClientState, type RpcRequestInit } from "@/src/types/rpc";
import { RPC_ENDPOINTS } from "@/src/config/rpcEndpoints";

class SorobanRpcClient {
  private readonly pool: EndpointPool;
  private readonly limiter: RpcRateLimiter;

  constructor(endpoints: readonly string[] = RPC_ENDPOINTS) {
    this.pool = new EndpointPool(endpoints);
    this.limiter = new RpcRateLimiter({ pool: this.pool });
  }

  /** Certification writes, escrow mutations, etc. — dispatched ahead of reads/analytics. */
  write<T>(request: RpcRequestInit): Promise<T> {
    return this.limiter.enqueue<T>(request, Priority.Write);
  }

  /** Certificate/status lookups and other reads. */
  read<T>(request: RpcRequestInit): Promise<T> {
    return this.limiter.enqueue<T>(request, Priority.Read);
  }

  /** Dashboards, telemetry, anything that can tolerate being deprioritized under load. */
  analytics<T>(request: RpcRequestInit): Promise<T> {
    return this.limiter.enqueue<T>(request, Priority.Analytics);
  }

  request<T>(request: RpcRequestInit, priority: Priority = Priority.Read): Promise<T> {
    return this.limiter.enqueue<T>(request, priority);
  }

  getState(): RpcClientState {
    return {
      rateLimited: this.limiter.queueDepth > 0,
      retryCount: this.limiter.retryCount,
      currentEndpoint: this.limiter.currentEndpoint,
      queueDepth: this.limiter.queueDepth,
    };
  }

  getEndpointStatuses() {
    return this.pool.getStatuses();
  }

  destroy(): void {
    this.limiter.destroy();
    this.pool.destroy();
  }
}

/** Shared singleton — one queue/token-bucket/endpoint-pool for the whole app. */
let sharedClient: SorobanRpcClient | null = null;

export function getSorobanRpcClient(): SorobanRpcClient {
  if (!sharedClient) sharedClient = new SorobanRpcClient();
  return sharedClient;
}

export { SorobanRpcClient };
