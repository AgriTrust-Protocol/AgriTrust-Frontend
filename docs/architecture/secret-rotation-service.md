# Secret Rotation Service Architecture

## Goals

The Secret Rotation Service coordinates safe, observable rotation of database credentials and API keys across AgriTrust services. It keeps raw secret values inside the server-side secret provider, maintains the critical-path P99 target below 100ms, and supports 99.99% availability by rotating with dual-read/dual-auth windows rather than hard cutovers.

## Scope and trust boundaries

- The rotation controller runs only in trusted backend or platform automation. Browser and edge-rendered code must never receive database passwords, API keys, or secret provider tokens.
- Services consume secrets through opaque version references: `secretId`, `versionId`, and `kind`.
- Rotation audit events and metrics are secret-free and use low-cardinality labels only.

## Rotation flow

1. **Prepare:** create a candidate secret version in the provider and validate that it matches the requested target.
2. **Dual-read:** configure the service to accept both active and candidate versions. Database rotations use new connection pools while draining old pools; API key rotations accept both key ids.
3. **Promote:** switch writers and outbound clients to the candidate version.
4. **Revoke:** revoke the previous active version after health checks pass.
5. **Complete:** emit success metrics and retain the audit trail.

Every phase performs health checks before continuing. Critical paths fail closed if P99 latency exceeds 100ms, the error-rate budget is exceeded, or the minimum healthy-instance quorum is unavailable.

## Deployment strategy

Use blue-green deployment with canary analysis:

- Deploy green with dual-read support enabled but no automatic rotations.
- Send 5% of traffic to green and verify P99 latency, error rate, rotation failures, connection-pool saturation, and authentication failures for at least 30 minutes.
- Increase canary traffic to 25%, 50%, then 100% only when alerting stays green.
- Enable scheduled rotations after one successful manual rotation in green.
- Keep blue warm until the previous secret version is revoked and all services have refreshed clients.

## Security controls

- No raw secret value is returned from rotation APIs, audit events, or metrics.
- Rotation actions require workload identity with permission scoped to the target `secretId`.
- Failed health checks trigger rollback before the previous version is revoked.
- All new target types require security review for telemetry labels, access control, rollback behavior, and provider permissions.
