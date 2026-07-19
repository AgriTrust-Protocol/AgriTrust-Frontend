# Database migration versioning and rollback support

AgriTrust services use a single PostgreSQL migration ledger named
`schema_migrations`. Every migration has a monotonically increasing integer
version, a descriptive name, forward SQL, rollback SQL, and a checksum. The
shared runner in `src/server/database/migrations.ts` applies only missing
versions and refuses to run when an applied checksum no longer matches the code
bundle.

## Architecture

1. Service startup or deployment automation constructs `DatabaseMigrationRunner`
   with the service database connection and its ordered migrations.
2. The runner creates `schema_migrations` if it does not exist and reads the
   currently applied versions.
3. A forward deploy targets the latest bundled version. A rollback targets the
   last known-good version.
4. The runner executes every planned item in a single transaction protected by
   `pg_advisory_xact_lock`, preventing blue and green deployments from mutating
   schema state concurrently.
5. Forward migrations insert a ledger row after their SQL succeeds. Rollbacks run
   the migration's `down` SQL in reverse order and delete the ledger row.

## Performance and availability

- The migration path is outside request handling; web critical paths keep the
  existing <100 ms P99 budget.
- Deployments must run migrations before routing canary traffic to green.
- Long-running or locking DDL must be split into expand/contract migrations:
  add nullable structures first, backfill out of band, then enforce constraints
  after canary analysis.

## Monitoring and alerts

Publish these deployment metrics from the orchestration job:

- `agritrust_database_migration_duration_ms`
- `agritrust_database_migration_applied_total{direction}`
- `agritrust_database_migration_failure_total{service}`
- `agritrust_database_migration_current_version{service}`

Page the database on-call if a migration fails after acquiring the advisory lock,
if checksum validation fails, or if green cannot reach the expected target
version before canary traffic starts.

## Runbook

### Forward migration

1. Review every `up` and `down` statement during security review.
2. Run `runner.run({ dryRun: true })` in CI and verify the generated plan.
3. In the green deployment pre-traffic hook, execute `runner.run()`.
4. Start canary at 5% traffic for 15 minutes and promote only when application
   error rate, database health, and critical-path P99 do not regress.

### Rollback

1. Stop promotion and route traffic back to blue.
2. Identify the last known-good migration version from `schema_migrations`.
3. Execute `runner.run({ targetVersion: <last-known-good> })` from one operator
   session or deployment job.
4. Confirm `schema_migrations` contains no versions newer than the rollback
   target and run the database readiness probe.
5. Open an incident review for any rollback that required manual SQL.
