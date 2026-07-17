import "server-only";
import { AdaptivePostgresPool, createPgAdapter, type PgPoolLike } from "./adaptivePostgresPool";

export type PgPoolFactory = (max: number) => PgPoolLike;

declare global {
  // Set by the server bootstrap that owns the selected PostgreSQL driver (for example `pg`).
  var __agritrustPgPoolFactory: PgPoolFactory | undefined;
}

let pool: AdaptivePostgresPool | undefined;

/**
 * Returns the configured database pool. Keeping the driver factory at server
 * bootstrap prevents a PostgreSQL driver from ever entering the client bundle.
 */
export function getDatabasePool(): AdaptivePostgresPool | undefined {
  const factory = globalThis.__agritrustPgPoolFactory;
  if (!factory) return undefined;
  pool ??= new AdaptivePostgresPool(
    (max) => createPgAdapter(factory(max), max),
    {
      min: numberEnv("DB_POOL_MIN", 2),
      max: numberEnv("DB_POOL_MAX", 20),
      initial: numberEnv("DB_POOL_INITIAL", 5),
      probeTimeoutMs: numberEnv("DB_HEALTH_PROBE_TIMEOUT_MS", 75),
    },
  );
  return pool;
}

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
