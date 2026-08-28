/**
 * RpcRateLimiter (issue #171)
 *
 * - Token bucket: `ratePerSecond` tokens refill continuously; each dispatched
 *   request consumes one.
 * - Priority queue: lower `Priority` number dispatches first (writes=1,
 *   reads=2, analytics=3); FIFO within the same priority.
 * - On a 429 (or any dispatch failure), the endpoint is marked unhealthy on
 *   the pool and the request is retried with exponential backoff
 *   (1s, 2s, 4s, capped at 8s) against the next healthy endpoint.
 * - A single deadline is set per request at enqueue time (`requestTimeoutMs`,
 *   default 10s) covering the *entire* lifecycle — queue wait plus every
 *   retry — not just the first attempt. If the deadline passes before the
 *   request settles, it's rejected with `RpcTimeoutError` and any in-flight
 *   fetch for it is aborted immediately via a per-request `AbortController`.
 *
 * Zero external dependencies — native `AbortController` + `setTimeout` only.
 */

import { EndpointPool } from "./endpointPool";
import {
  Priority,
  RpcNoHealthyEndpointError,
  RpcTimeoutError,
  type QueuedRequest,
  type RpcRequestInit,
} from "@/src/types/rpc";
import { RPC_CONFIG } from "@/src/config/rpcEndpoints";

interface InternalQueuedRequest<T> extends QueuedRequest<T> {
  deadline: number;
  settled: boolean;
  abortController: AbortController;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

export interface RateLimiterOptions {
  pool: EndpointPool;
  ratePerSecond?: number;
  requestTimeoutMs?: number;
  backoff?: { baseMs: number; maxMs: number; factor: number };
  fetchImpl?: typeof fetch;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RpcRateLimiter {
  private readonly pool: EndpointPool;
  private readonly capacity: number;
  private readonly timeoutMs: number;
  private readonly backoff: { baseMs: number; maxMs: number; factor: number };
  private readonly fetchImpl: typeof fetch;

  private tokens: number;
  private lastRefill: number;
  private queue: InternalQueuedRequest<unknown>[] = [];
  private draining = false;

  /** Last endpoint a request was actually dispatched against — surfaced to the UI. */
  private lastDispatchedEndpoint: string | null = null;
  private totalRetries = 0;

  constructor(options: RateLimiterOptions) {
    this.pool = options.pool;
    this.capacity = options.ratePerSecond ?? RPC_CONFIG.defaultRateLimitPerSecond;
    this.timeoutMs = options.requestTimeoutMs ?? RPC_CONFIG.requestTimeoutMs;
    this.backoff = options.backoff ?? RPC_CONFIG.backoff;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }

  get queueDepth(): number {
    return this.queue.length;
  }

  get currentEndpoint(): string | null {
    return this.lastDispatchedEndpoint;
  }

  get retryCount(): number {
    return this.totalRetries;
  }

  enqueue<T>(request: RpcRequestInit, priority: Priority = Priority.Read): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const now = Date.now();
      const item: InternalQueuedRequest<T> = {
        id: crypto.randomUUID(),
        priority,
        request,
        enqueuedAt: now,
        retryCount: 0,
        resolve,
        reject,
        deadline: now + this.timeoutMs,
        settled: false,
        abortController: new AbortController(),
        timeoutHandle: undefined as unknown as ReturnType<typeof setTimeout>,
      };
      const erased = item as unknown as InternalQueuedRequest<unknown>;
      erased.timeoutHandle = setTimeout(() => this.timeoutRequest(erased), this.timeoutMs);
      this.insertByPriority(erased);
      void this.drainQueue();
    });
  }

  private insertByPriority(item: InternalQueuedRequest<unknown>): void {
    const insertAt = this.queue.findIndex((queued) => queued.priority > item.priority);
    if (insertAt === -1) this.queue.push(item);
    else this.queue.splice(insertAt, 0, item);
  }

  private timeoutRequest(item: InternalQueuedRequest<unknown>): void {
    if (item.settled) return;
    item.settled = true;
    const idx = this.queue.indexOf(item);
    if (idx !== -1) this.queue.splice(idx, 1);
    item.abortController.abort();
    item.reject(new RpcTimeoutError(item.id, this.timeoutMs));
  }

  private settle(item: InternalQueuedRequest<unknown>, run: () => void): void {
    if (item.settled) return;
    item.settled = true;
    clearTimeout(item.timeoutHandle);
    run();
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    if (elapsedSeconds <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.capacity);
    this.lastRefill = now;
  }

  /** Drains the queue, respecting the token bucket. Dispatch itself is fire-and-forget so token pacing isn't blocked by slow requests. */
  private async drainQueue(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        this.refillTokens();
        if (this.tokens < 1) {
          const msPerToken = 1000 / this.capacity;
          await delay(Math.max(4, msPerToken));
          continue;
        }
        const item = this.queue.shift();
        if (!item) continue;
        if (item.settled) continue; // timed out while waiting for a token
        this.tokens -= 1;
        void this.dispatch(item);
      }
    } finally {
      this.draining = false;
    }
  }

  private async dispatch(item: InternalQueuedRequest<unknown>): Promise<void> {
    if (item.settled) return;

    const endpoint = this.pool.getHealthyEndpoint();
    if (!endpoint) {
      this.retryOrFail(item, new RpcNoHealthyEndpointError());
      return;
    }
    this.lastDispatchedEndpoint = endpoint;

    try {
      const response = await this.fetchImpl(`${endpoint}${item.request.path}`, {
        method: item.request.method ?? "GET",
        headers: item.request.headers,
        body: item.request.body !== undefined ? JSON.stringify(item.request.body) : undefined,
        signal: item.abortController.signal,
      });

      if (response.status === 429) {
        this.pool.markUnhealthy(endpoint);
        this.retryOrFail(item, new Error(`429 from ${endpoint}`));
        return;
      }
      if (!response.ok) {
        this.pool.markUnhealthy(endpoint);
        this.retryOrFail(item, new Error(`RPC request failed: ${response.status} ${response.statusText}`));
        return;
      }

      const data = await response.json();
      this.settle(item, () => item.resolve(data));
    } catch (error) {
      if (item.settled) return; // deadline already fired and aborted this fetch
      this.pool.markUnhealthy(endpoint);
      this.retryOrFail(item, error);
    }
  }

  private retryOrFail(item: InternalQueuedRequest<unknown>, _lastError: unknown): void {
    if (item.settled) return;

    // Always retry with backoff — the deadline set at enqueue time (see
    // `timeoutHandle`) is the single source of truth for giving up, so a
    // caller always sees a clean RpcTimeoutError after `requestTimeoutMs`
    // rather than whatever the last transient failure happened to be. If
    // `delay(backoffMs)` resolves after the deadline already fired,
    // `item.settled` is checked again below and this becomes a no-op.
    const backoffMs = Math.min(this.backoff.maxMs, this.backoff.baseMs * this.backoff.factor ** item.retryCount);
    item.retryCount += 1;
    this.totalRetries += 1;
    delay(backoffMs).then(() => {
      if (item.settled) return;
      this.insertByPriority(item);
      void this.drainQueue();
    });
  }

  destroy(): void {
    for (const item of this.queue) {
      clearTimeout(item.timeoutHandle);
      item.abortController.abort();
    }
    this.queue = [];
  }
}
