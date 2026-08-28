/**
 * Types shared by the Soroban RPC rate-limiting middleware (issue #171):
 * src/services/rpc/rateLimiter.ts, endpointPool.ts, client.ts, and the
 * useSorobanRpc hook.
 */

/** Lower number = dispatched first. */
export enum Priority {
  Write = 1,
  Read = 2,
  Analytics = 3,
}

export type RpcHttpMethod = "GET" | "POST";

export interface RpcRequestInit {
  /** Path appended to the active endpoint's base URL, e.g. "/getHealth". */
  path: string;
  method?: RpcHttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface QueuedRequest<T = unknown> {
  id: string;
  priority: Priority;
  request: RpcRequestInit;
  enqueuedAt: number;
  retryCount: number;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

/** Thrown when a queued request isn't dispatched-and-settled within the configured timeout. */
export class RpcTimeoutError extends Error {
  constructor(
    public readonly requestId: string,
    public readonly timeoutMs: number
  ) {
    super(`RPC request ${requestId} timed out after ${timeoutMs}ms`);
    this.name = "RpcTimeoutError";
  }
}

/** Thrown when no endpoint in the pool is currently healthy and retries have been exhausted by the deadline. */
export class RpcNoHealthyEndpointError extends Error {
  constructor() {
    super("No healthy Soroban RPC endpoints available");
    this.name = "RpcNoHealthyEndpointError";
  }
}

export interface RpcEndpointStatus {
  url: string;
  healthy: boolean;
  lastPing: number;
  consecutiveFailures: number;
}

export interface RpcClientState {
  rateLimited: boolean;
  retryCount: number;
  currentEndpoint: string | null;
  queueDepth: number;
}
