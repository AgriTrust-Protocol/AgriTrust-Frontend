# Scheduled database backup verification and restore testing

## Architecture

Every stateful service creates an encrypted backup using its existing backup
provider. At 02:15 UTC, the `Verify Database Backups` workflow calls the
private backup-verification control-plane endpoint. The endpoint selects the
newest backup, verifies its artifact checksum, restores it **only** to an
ephemeral, network-isolated database, runs the service's read-only health and
schema checks, destroys the restore target, and publishes a
`BackupVerificationResult`.

The shared TypeScript contract in `src/services/backupVerification.ts` defines
the status result and fails a run when the backup is older than 26 hours. It
intentionally does not contain database credentials, backup URIs, or restored
records. Control-plane telemetry publishes `verification_success`,
`backup_age_seconds`, and `restore_duration_seconds`, labeled only by service
and environment.

## Security controls

- Store `BACKUP_VERIFICATION_URL`, `BACKUP_VERIFICATION_TOKEN`, and
  `BACKUP_ALERT_WEBHOOK_URL` as protected production environment secrets.
- Require the endpoint to authenticate the bearer token, rate-limit callers,
  and reject restore targets other than its isolated allow-list.
- Use a restore identity with read access to the backup bucket and write access
  only to ephemeral restore databases. It must not have production database
  credentials.
- Verify the backup checksum before restore; encrypt backups and use KMS
  decryption only inside the restore worker. Never log URLs, credentials,
  records, or SQL output.
- Delete the temporary database, volumes, and KMS grants after every run,
  including failed runs. Audit all restore requests.

## Alerting and dashboard

Create a **Database backup restore verification** dashboard with, per service:

1. last successful verification time;
2. backup age (warning at 24 h, critical at 26 h);
3. restore duration and p99 over 30 days;
4. verification success rate and the last failure reason.

Page the on-call database owner immediately when `verification_success` is
zero, no result arrives within 26 hours, checksum validation fails, or cleanup
fails. Route a 24-hour warning to the service channel. The GitHub workflow
also emits a critical webhook notification when its request fails.

## Deployment and rollout

1. Deploy the control-plane endpoint in blue-green mode; run a staging restore
   against the green environment and compare emitted metrics before switching
   traffic.
2. Canary one low-risk service for seven successful daily restores. Confirm no
   production network route is reachable from its restore worker and verify
   cleanup audit events.
3. Add services in batches. Roll back by disabling the service in the
   control-plane allow-list; do not disable existing backups or alerts.
4. The scheduling request is off the customer critical path. Keep the endpoint
   asynchronous and return promptly after accepting the job, preserving the
   <100 ms P99 target for user-facing paths.

## Runbook: a failed verification

1. Acknowledge the page and identify the affected service, backup timestamp,
   checksum result, and failure reason from the dashboard.
2. Confirm the temporary restore database was deleted and that no production
   credentials or data were exposed. If not, revoke the restore identity and
   escalate to Security immediately.
3. Check backup provider availability, KMS access, available restore capacity,
   and schema/health-check compatibility. Do not restore into production.
4. Repair the cause, trigger **Verify Database Backups** manually, and require
   a passing isolated restore before resolving the incident.
5. Record the incident, recovery-point age, recovery-time duration, and any
   follow-up actions. Security reviews changes to identities, KMS policies, or
   network isolation.
