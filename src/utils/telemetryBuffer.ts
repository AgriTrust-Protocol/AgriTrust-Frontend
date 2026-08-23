/**
 * Time-batched sliding-window queue for high-frequency telemetry frames.
 *
 * Upstream WebSocket feeds can emit hundreds of frames per second; letting
 * every frame trigger a React `setState` spends ~90% of CPU time on
 * reconciliation. This buffer absorbs the stream into a pending queue and
 * flushes it to subscribers as one batch every `batchInterval` ms
 * (default 450ms, roughly 2 chart renders/sec), keeping renders below the
 * 3/sec budget while dropping no more than 10% of frames in any batching
 * window (batching itself drops nothing).
 *
 * Flushed points are archived in a sliding window capped at `maxPoints`
 * entries (default 10,000): on each flush, points older than
 * `maxPoints * averageInterval` are evicted and counted as dropped.
 */

export interface TelemetryPoint {
  /** Metric channel, e.g. "temperature" | "humidity" | "gps". */
  metric: string;
  value: number;
  /** Unix-ms timestamp of the reading. */
  timestamp: number;
}

export type TelemetrySubscriber = (batch: readonly TelemetryPoint[]) => void;

export interface TelemetryBufferOptions {
  /** Maximum archived points before oldest entries are evicted. Default 10000. */
  maxPoints?: number;
  /** Flush cadence in ms. Default 450. */
  batchInterval?: number;
}

const DEFAULT_MAX_POINTS = 10_000;
const DEFAULT_BATCH_INTERVAL_MS = 450;

export class TelemetryBuffer {
  readonly maxPoints: number;
  readonly batchInterval: number;

  private pendingQueue: TelemetryPoint[] = [];
  private archivedQueue: TelemetryPoint[] = [];
  private subscribers = new Set<TelemetrySubscriber>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private droppedCount = 0;
  private lastFlushAt = 0;

  constructor(options: TelemetryBufferOptions = {}) {
    this.maxPoints = options.maxPoints ?? DEFAULT_MAX_POINTS;
    this.batchInterval = options.batchInterval ?? DEFAULT_BATCH_INTERVAL_MS;
  }

  /** Enqueue a single incoming frame; flushed to subscribers on the next tick. */
  push(point: TelemetryPoint): void {
    this.pendingQueue.push(point);
    this.start();
  }

  /** Register a flush listener. Returns an unsubscribe function. */
  subscribe(subscriber: TelemetrySubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  /**
   * Move all pending frames into the archive as one batch, evict stale
   * entries, and notify subscribers once.
   */
  flush(): void {
    if (this.pendingQueue.length === 0) return;
    const batch = this.pendingQueue;
    this.pendingQueue = [];

    for (const point of batch) this.archivedQueue.push(point);
    this.evict();

    this.lastFlushAt = Date.now();
    for (const subscriber of this.subscribers) subscriber(batch);
  }

  /** All archived points within [startTime, endTime]. */
  getWindow(startTime: number, endTime: number): TelemetryPoint[] {
    const from = this.indexOfFirstAtOrAfter(startTime);
    if (from < 0) return [];
    const out: TelemetryPoint[] = [];
    for (let i = from; i < this.archivedQueue.length; i++) {
      const point = this.archivedQueue[i];
      if (point.timestamp > endTime) break;
      out.push(point);
    }
    return out;
  }

  /** Number of frames evicted from the sliding window so far. */
  get droppedFrames(): number {
    return this.droppedCount;
  }

  /** Timestamp of the most recent flush (0 before the first flush). */
  get flushedAt(): number {
    return this.lastFlushAt;
  }

  /** Snapshot of every archived point (oldest first). */
  getSnapshot(): readonly TelemetryPoint[] {
    return this.archivedQueue;
  }

  /** Stop the flush timer and drop listeners. Archived data is preserved. */
  dispose(): void {
    this.stop();
    this.flush();
    this.subscribers.clear();
  }

  private start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.flush(), this.batchInterval);
  }

  private stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Enforce both retention bounds on the archive:
   *  - time-based: points older than `maxPoints * averageInterval` are evicted
   *  - memory-based: hard cap at `maxPoints` cached points
   */
  private evict(): void {
    const archived = this.archivedQueue;
    if (archived.length === 0) return;

    const newest = archived[archived.length - 1].timestamp;
    const oldest = archived[0].timestamp;
    const averageInterval =
      archived.length > 1 ? (newest - oldest) / (archived.length - 1) : 0;

    let cutoffIndex = 0;
    if (averageInterval > 0) {
      const cutoff = newest - this.maxPoints * averageInterval;
      while (
        cutoffIndex < archived.length &&
        archived[cutoffIndex].timestamp < cutoff
      ) {
        cutoffIndex++;
      }
    }

    // Memory bound: never cache more than maxPoints.
    const overflow = archived.length - this.maxPoints;
    if (overflow > cutoffIndex) cutoffIndex = overflow;

    if (cutoffIndex > 0) {
      this.droppedCount += cutoffIndex;
      this.archivedQueue = archived.slice(cutoffIndex);
    }
  }

  private indexOfFirstAtOrAfter(startTime: number): number {
    // Binary search over the time-sorted archive.
    let lo = 0;
    let hi = this.archivedQueue.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.archivedQueue[mid].timestamp < startTime) lo = mid + 1;
      else hi = mid;
    }
    return lo < this.archivedQueue.length ? lo : -1;
  }
}
