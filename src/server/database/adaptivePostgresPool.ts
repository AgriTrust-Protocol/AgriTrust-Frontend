export interface PoolSnapshot {
  readonly total: number;
  readonly idle: number;
  readonly waiting: number;
  readonly max: number;
}

export interface QueryResultRow { [column: string]: unknown }

export interface QueryResult<T extends QueryResultRow = QueryResultRow> { rows: T[] }

export interface PoolAdapter {
  query<T extends QueryResultRow = QueryResultRow>(sql: string): Promise<QueryResult<T>>;
  end(): Promise<void>;
  snapshot(): PoolSnapshot;
}

export interface AdaptivePoolOptions {
  readonly min: number;
  readonly max: number;
  readonly initial: number;
  readonly probeTimeoutMs: number;
  readonly slowQueryMs: number;
  readonly scaleUpCooldownMs: number;
  readonly scaleDownCooldownMs: number;
  readonly resizeStep: number;
}

export interface DatabaseHealth {
  readonly status: "ok" | "degraded" | "down";
  readonly checkedAt: string;
  readonly latencyMs: number;
  readonly consecutiveFailures: number;
  readonly pool: PoolSnapshot;
}

export interface PoolMetrics {
  readonly probesTotal: number;
  readonly probeFailuresTotal: number;
  readonly resizeTotal: number;
  readonly targetSize: number;
  readonly ewmaLatencyMs: number;
  readonly health: DatabaseHealth | null;
}

const DEFAULTS: AdaptivePoolOptions = {
  min: 2,
  max: 20,
  initial: 5,
  probeTimeoutMs: 75,
  slowQueryMs: 50,
  scaleUpCooldownMs: 30_000,
  scaleDownCooldownMs: 300_000,
  resizeStep: 2,
};

/**
 * A hot-swappable PostgreSQL pool. Scaling creates a replacement pool and
 * drains the old one, avoiding mutation of undocumented `pg.Pool` internals.
 */
export class AdaptivePostgresPool {
  private active: PoolAdapter;
  private targetSize: number;
  private lastResizeAt = 0;
  private ewmaLatencyMs = 0;
  private consecutiveFailures = 0;
  private lastHealth: DatabaseHealth | null = null;
  private probesTotal = 0;
  private probeFailuresTotal = 0;
  private resizeTotal = 0;

  constructor(
    private readonly createPool: (max: number) => PoolAdapter,
    options: Partial<AdaptivePoolOptions> = {},
    initialPool?: PoolAdapter,
  ) {
    this.options = { ...DEFAULTS, ...options };
    this.validateOptions();
    this.targetSize = this.options.initial;
    this.active = initialPool ?? createPool(this.targetSize);
  }

  private readonly options: AdaptivePoolOptions;

  async query<T extends QueryResultRow = QueryResultRow>(sql: string): Promise<QueryResult<T>> {
    return this.active.query<T>(sql);
  }

  /** Runs a bounded, side-effect-free probe. Never includes database errors in its result. */
  async probe(now = Date.now()): Promise<DatabaseHealth> {
    this.probesTotal += 1;
    const startedAt = now;
    try {
      await withTimeout(this.active.query("SELECT 1"), this.options.probeTimeoutMs);
      const latencyMs = Math.max(0, Date.now() - startedAt);
      this.consecutiveFailures = 0;
      this.ewmaLatencyMs = this.ewmaLatencyMs === 0 ? latencyMs : this.ewmaLatencyMs * 0.8 + latencyMs * 0.2;
      await this.adapt(latencyMs, now);
      return this.setHealth("ok", latencyMs);
    } catch {
      this.probeFailuresTotal += 1;
      this.consecutiveFailures += 1;
      const latencyMs = Math.max(0, Date.now() - startedAt);
      // One failure is degraded; readiness becomes down only after two probes.
      return this.setHealth(this.consecutiveFailures >= 2 ? "down" : "degraded", latencyMs);
    }
  }

  getMetrics(): PoolMetrics {
    return {
      probesTotal: this.probesTotal,
      probeFailuresTotal: this.probeFailuresTotal,
      resizeTotal: this.resizeTotal,
      targetSize: this.targetSize,
      ewmaLatencyMs: this.ewmaLatencyMs,
      health: this.lastHealth,
    };
  }

  async close(): Promise<void> {
    await this.active.end();
  }

  private setHealth(status: DatabaseHealth["status"], latencyMs: number): DatabaseHealth {
    this.lastHealth = {
      status,
      checkedAt: new Date().toISOString(),
      latencyMs,
      consecutiveFailures: this.consecutiveFailures,
      pool: this.active.snapshot(),
    };
    return this.lastHealth;
  }

  private async adapt(latencyMs: number, now: number): Promise<void> {
    const pool = this.active.snapshot();
    const saturated = pool.waiting > 0 || (pool.total >= this.targetSize && pool.idle === 0);
    const shouldGrow = saturated || latencyMs > this.options.slowQueryMs;
    const canGrow = now - this.lastResizeAt >= this.options.scaleUpCooldownMs;
    const shouldShrink = pool.waiting === 0 && pool.idle >= Math.ceil(pool.total / 2) && this.ewmaLatencyMs <= this.options.slowQueryMs;
    const canShrink = now - this.lastResizeAt >= this.options.scaleDownCooldownMs;

    if (shouldGrow && canGrow && this.targetSize < this.options.max) {
      await this.resize(Math.min(this.options.max, this.targetSize + this.options.resizeStep), now);
    } else if (shouldShrink && canShrink && this.targetSize > this.options.min) {
      await this.resize(Math.max(this.options.min, this.targetSize - this.options.resizeStep), now);
    }
  }

  private async resize(nextSize: number, now: number): Promise<void> {
    if (nextSize === this.targetSize) return;
    const replacement = this.createPool(nextSize);
    const previous = this.active;
    this.active = replacement;
    this.targetSize = nextSize;
    this.lastResizeAt = now;
    this.resizeTotal += 1;
    // Queries already checked out from a pg pool complete before Pool#end resolves.
    void previous.end().catch(() => undefined);
  }

  private validateOptions(): void {
    const { min, max, initial, probeTimeoutMs, resizeStep } = this.options;
    if (min < 1 || max < min || initial < min || initial > max || probeTimeoutMs < 1 || resizeStep < 1) {
      throw new Error("Invalid adaptive PostgreSQL pool configuration");
    }
  }
}

export interface PgPoolLike {
  query<T extends QueryResultRow = QueryResultRow>(sql: string): Promise<QueryResult<T>>;
  end(): Promise<void>;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

/** Adapts a `pg.Pool` (or compatible server driver) without bundling it into clients. */
export function createPgAdapter(pool: PgPoolLike, max: number): PoolAdapter {
  return {
    query: <T extends QueryResultRow>(sql: string) => pool.query<T>(sql),
    end: () => pool.end(),
    snapshot: () => ({ total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount, max }),
  };
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    operation,
    new Promise<T>((_, reject) => {
      timeout = setTimeout(() => reject(new Error("Database probe timed out")), timeoutMs);
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}
