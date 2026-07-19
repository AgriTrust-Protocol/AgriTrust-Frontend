# Secret Rotation Service Runbook

## Dashboards and alerts

Monitor the Secret Rotation Service dashboard during all rotations. Page the on-call engineer if any of these alerts fire:

- `SecretRotationFailure`: any failed or rolled-back rotation in production.
- `SecretRotationCriticalPathLatency`: P99 latency above 100ms for a critical service during rotation.
- `SecretRotationStalled`: a rotation has not completed before its deadline.
- `SecretRotationAuthErrors`: authentication failures increase after promotion.

## Manual rotation procedure

1. Confirm the change ticket, owner, target service, and `secretId`.
2. Verify green is healthy before starting the rotation.
3. Start rotation for one canary service instance or 5% traffic slice.
4. Watch P99 latency, error rate, authentication failures, and healthy instance count for 30 minutes.
5. Promote to 25%, 50%, and 100% only while all alerts remain green.
6. Revoke the previous version after all clients report the candidate version.
7. Record the rotation id and dashboard link in the change ticket.

## Rollback

Rollback is automatic when health checks fail before revocation. If a human rollback is required:

1. Disable automatic rotations for the affected `secretId`.
2. Route traffic back to blue or the previous healthy green revision.
3. Restore the previous active version in the service configuration if it has not been revoked.
4. If revocation already occurred, create a fresh candidate version and promote it through the same canary flow.
5. Audit logs and application logs must be reviewed without copying secret values into incident notes.

## Security incident handling

For suspected exposure, disable the affected credential, rotate immediately with security approval, invalidate sessions or database connections that used the old version, and search logs for accidental secret emission. Do not paste database credentials or API keys into chat, tickets, dashboards, or PR descriptions.
