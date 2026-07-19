import { describe, expect, it } from "vitest";
import { buildMigrationPlan, DatabaseMigrationRunner, type MigrationConnection, type MigrationStep } from "../migrations";

const migrations: MigrationStep[] = [
  { version: 1, name: "create_farms", up: ["CREATE TABLE farms(id text)"], down: ["DROP TABLE farms"] },
  { version: 2, name: "add_owner", up: ["ALTER TABLE farms ADD owner text"], down: ["ALTER TABLE farms DROP owner"] },
  { version: 3, name: "add_index", up: ["CREATE INDEX farms_owner_idx ON farms(owner)"], down: ["DROP INDEX farms_owner_idx"] },
];

class RecordingConnection implements MigrationConnection {
  readonly calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
  appliedRows: Array<{ version: number; name: string; checksum: string; applied_at: Date }> = [];

  async query<Row extends Record<string, unknown>>(sql: string, params?: readonly unknown[]) {
    this.calls.push({ sql, params });
    if (sql.startsWith("SELECT version")) return { rows: this.appliedRows as unknown as Row[] };
    if (sql.startsWith("SELECT COALESCE")) return { rows: [{ version: Math.max(0, ...this.appliedRows.map((row) => row.version)) }] as unknown as Row[] };
    return { rows: [] as Row[] };
  }
}

describe("buildMigrationPlan", () => {
  it("plans forward migrations in ascending order", () => {
    expect(buildMigrationPlan(migrations, [1], 3).map(({ migration, direction }) => [migration.version, direction])).toEqual([
      [2, "up"],
      [3, "up"],
    ]);
  });

  it("plans rollbacks in descending order", () => {
    expect(buildMigrationPlan(migrations, [1, 2, 3], 1).map(({ migration, direction }) => [migration.version, direction])).toEqual([
      [3, "down"],
      [2, "down"],
    ]);
  });
});

describe("DatabaseMigrationRunner", () => {
  it("wraps migrations with advisory locking and records versions", async () => {
    const connection = new RecordingConnection();
    const runner = new DatabaseMigrationRunner(connection, migrations.slice(0, 2));

    const result = await runner.run({ targetVersion: 2, lockKey: 99 });

    expect(result.applied.map((item) => item.migration.version)).toEqual([1, 2]);
    expect(connection.calls.map((call) => call.sql)).toEqual(expect.arrayContaining(["BEGIN", "SELECT pg_advisory_xact_lock($1)", "COMMIT"]));
    expect(connection.calls.filter((call) => call.sql.startsWith("INSERT INTO schema_migrations"))).toHaveLength(2);
  });

  it("does not execute SQL statements for dry runs", async () => {
    const connection = new RecordingConnection();
    const runner = new DatabaseMigrationRunner(connection, migrations);

    const result = await runner.run({ targetVersion: 3, dryRun: true });

    expect(result.applied).toHaveLength(3);
    expect(connection.calls.some((call) => call.sql === "BEGIN")).toBe(false);
    expect(connection.calls.some((call) => call.sql.includes("CREATE TABLE farms"))).toBe(false);
  });
});
