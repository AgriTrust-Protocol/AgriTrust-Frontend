export type MigrationDirection = "up" | "down";

export interface MigrationQueryResult<Row extends Record<string, unknown> = Record<string, unknown>> {
  readonly rows: Row[];
}

export interface MigrationConnection {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<MigrationQueryResult<Row>>;
}

export interface MigrationStep {
  readonly version: number;
  readonly name: string;
  readonly up: readonly string[];
  readonly down: readonly string[];
  readonly checksum?: string;
}

export interface AppliedMigration {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
  readonly appliedAt: Date;
}

export interface MigrationPlanItem {
  readonly migration: MigrationStep;
  readonly direction: MigrationDirection;
}

export interface MigrationRunOptions {
  readonly targetVersion?: number;
  readonly dryRun?: boolean;
  readonly lockKey?: number;
}

export interface MigrationRunResult {
  readonly targetVersion: number;
  readonly dryRun: boolean;
  readonly applied: readonly MigrationPlanItem[];
}

const DEFAULT_LOCK_KEY = 4_107_107;
const VERSION_TABLE = "schema_migrations";

/**
 * Executes ordered PostgreSQL schema migrations and records every applied
 * version. Rollbacks use the same transaction and lock path as forward
 * migrations so only one deploy color can mutate schema state at a time.
 */
export class DatabaseMigrationRunner {
  private readonly migrations: readonly MigrationStep[];

  constructor(
    private readonly connection: MigrationConnection,
    migrations: readonly MigrationStep[],
  ) {
    this.migrations = validateMigrations(migrations);
  }

  async currentVersion(): Promise<number> {
    await this.ensureVersionTable();
    const result = await this.connection.query<{ version: number }>(`SELECT COALESCE(MAX(version), 0) AS version FROM ${VERSION_TABLE}`);
    return Number(result.rows[0]?.version ?? 0);
  }

  async appliedMigrations(): Promise<readonly AppliedMigration[]> {
    await this.ensureVersionTable();
    const result = await this.connection.query<{
      version: number;
      name: string;
      checksum: string;
      applied_at: Date | string;
    }>(`SELECT version, name, checksum, applied_at FROM ${VERSION_TABLE} ORDER BY version ASC`);
    return result.rows.map((row) => ({
      version: Number(row.version),
      name: String(row.name),
      checksum: String(row.checksum),
      appliedAt: new Date(row.applied_at),
    }));
  }

  async plan(targetVersion = this.latestVersion()): Promise<readonly MigrationPlanItem[]> {
    const applied = await this.appliedMigrations();
    assertAppliedChecksums(applied, this.migrations);
    return buildMigrationPlan(this.migrations, applied.map(({ version }) => version), targetVersion);
  }

  async run(options: MigrationRunOptions = {}): Promise<MigrationRunResult> {
    const targetVersion = options.targetVersion ?? this.latestVersion();
    if (options.dryRun) {
      return { targetVersion, dryRun: true, applied: await this.plan(targetVersion) };
    }

    await this.connection.query("BEGIN");
    try {
      await this.connection.query("SELECT pg_advisory_xact_lock($1)", [options.lockKey ?? DEFAULT_LOCK_KEY]);
      const plan = await this.plan(targetVersion);
      for (const item of plan) {
        await this.applyPlanItem(item);
      }
      await this.connection.query("COMMIT");
      return { targetVersion, dryRun: false, applied: plan };
    } catch (error) {
      await this.connection.query("ROLLBACK");
      throw error;
    }
  }

  private latestVersion(): number {
    return this.migrations.at(-1)?.version ?? 0;
  }

  private async ensureVersionTable(): Promise<void> {
    await this.connection.query(`CREATE TABLE IF NOT EXISTS ${VERSION_TABLE} (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  }

  private async applyPlanItem(item: MigrationPlanItem): Promise<void> {
    const statements = item.direction === "up" ? item.migration.up : item.migration.down;
    for (const sql of statements) {
      await this.connection.query(sql);
    }

    if (item.direction === "up") {
      await this.connection.query(
        `INSERT INTO ${VERSION_TABLE} (version, name, checksum) VALUES ($1, $2, $3)`,
        [item.migration.version, item.migration.name, checksumMigration(item.migration)],
      );
      return;
    }

    await this.connection.query(`DELETE FROM ${VERSION_TABLE} WHERE version = $1`, [item.migration.version]);
  }
}

export function buildMigrationPlan(
  migrations: readonly MigrationStep[],
  appliedVersions: readonly number[],
  targetVersion: number,
): readonly MigrationPlanItem[] {
  const ordered = validateMigrations(migrations);
  if (targetVersion < 0 || !Number.isInteger(targetVersion)) {
    throw new Error("Migration target version must be a non-negative integer");
  }
  if (targetVersion > (ordered.at(-1)?.version ?? 0)) {
    throw new Error(`Migration target ${targetVersion} is newer than the latest bundled migration`);
  }

  const currentVersion = Math.max(0, ...appliedVersions);
  if (targetVersion === currentVersion) return [];

  if (targetVersion > currentVersion) {
    return ordered
      .filter((migration) => migration.version > currentVersion && migration.version <= targetVersion)
      .map((migration) => ({ migration, direction: "up" as const }));
  }

  return [...ordered]
    .reverse()
    .filter((migration) => migration.version <= currentVersion && migration.version > targetVersion)
    .map((migration) => ({ migration, direction: "down" as const }));
}

export function checksumMigration(migration: MigrationStep): string {
  if (migration.checksum) return migration.checksum;
  const payload = [migration.version, migration.name, ...migration.up, ...migration.down].join("\u001f");
  let hash = 2166136261;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function validateMigrations(migrations: readonly MigrationStep[]): readonly MigrationStep[] {
  const ordered = [...migrations].sort((left, right) => left.version - right.version);
  const seen = new Set<number>();
  for (const migration of ordered) {
    if (!Number.isInteger(migration.version) || migration.version < 1) throw new Error("Migration versions must be positive integers");
    if (seen.has(migration.version)) throw new Error(`Duplicate migration version ${migration.version}`);
    if (!migration.name.trim()) throw new Error(`Migration ${migration.version} must have a name`);
    if (migration.up.length === 0 || migration.down.length === 0) throw new Error(`Migration ${migration.version} must define up and down SQL`);
    seen.add(migration.version);
  }
  return ordered;
}

function assertAppliedChecksums(applied: readonly AppliedMigration[], migrations: readonly MigrationStep[]): void {
  const bundled = new Map(migrations.map((migration) => [migration.version, migration]));
  for (const row of applied) {
    const migration = bundled.get(row.version);
    if (!migration) throw new Error(`Database has unknown applied migration ${row.version}`);
    if (row.checksum !== checksumMigration(migration)) throw new Error(`Checksum mismatch for migration ${row.version}`);
  }
}
