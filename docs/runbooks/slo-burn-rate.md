# SLO burn-rate runbook

## Objectives

AgriTrust frontend uses system-wide service level objectives for customer-facing
traffic:

- **Availability:** 99.99% successful requests, leaving a 0.01% error budget.
- **Latency:** critical path P99 must remain below 100ms.
- **Security:** incident response must preserve logs, traces, and deployment
  evidence for security review before permanent remediation.

## Alert response

1. Open the SLO dashboard and compare burn-rate, 5xx ratio, and P99 latency
   panels for the stable and canary deployments.
2. If `AgriTrustFrontendFastErrorBudgetBurn` or
   `AgriTrustFrontendSustainedErrorBudgetBurn` fires, page the on-call engineer
   and freeze the rollout until the burn rate returns below threshold.
3. If the canary has materially higher burn rate or P99 latency than stable,
   shift traffic back to stable and keep the failed version available for
   forensic analysis.
4. Check upstream API, Soroban RPC, CDN, and wallet-provider traces before
   changing frontend capacity.
5. Record the suspected cause, impacted time windows, and rollback or mitigation
   in the incident ticket.

## Blue-green and canary gates

1. Deploy the candidate version to green with telemetry enabled.
2. Route 5% of traffic to green for 15 minutes.
3. Promote to 25%, then 100%, only when availability burn rate is below 1x and
   critical-path P99 is below 100ms for the observation window.
4. Roll back immediately on page-level burn-rate or latency alerts.

## Dashboard checks

Use the `AgriTrust Frontend Service Mesh` Grafana dashboard to inspect:

- Availability burn rate for 5m, 30m, 1h, 2h, 6h, and 1d windows.
- Critical path P99 latency against the 100ms objective.
- Ready pods for stable and canary deployment tracks.
