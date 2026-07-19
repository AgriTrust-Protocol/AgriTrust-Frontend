# Incident response runbook automation with PagerDuty

## Architecture

AgriTrust incident automation turns Prometheus or service-mesh alerts into a
PagerDuty incident, builds a deterministic runbook plan, and records the plan as
a PagerDuty change event. The frontend package keeps the runbook planner as pure
TypeScript so it can be reused by edge handlers, workers, or backend services
without adding latency to browser critical paths.

```text
PrometheusRule / SLO alert
        |
        v
PagerDuty Events API -> incident webhook -> runbook planner
        |                                      |
        |                                      v
        +---------------------------- PagerDuty change event
                                               |
                                               v
                              Slack/on-call notes, Grafana, deploy controls
```

## Automation policy

- **Critical or triggered incidents** page the primary on-call, freeze canary
  promotion, collect evidence automatically, and require human approval before a
  blue-green rollback.
- **Warning and error incidents** open dashboards and notify the service channel
  unless PagerDuty is still in the triggered state.
- **Informational or resolved incidents** are observe-only and must not page.
- Rollback automation remains approval-gated to preserve security review and
  change-management requirements.

## PagerDuty integration

1. Configure a PagerDuty Events API v2 integration named
   `agritrust-frontend-runbook-automation`.
2. Store the routing key outside public `NEXT_PUBLIC_*` variables. The planner's
   `toPagerDutyChangeEvent` accepts the key at the worker/API boundary.
3. Add alert annotations for `runbook_url` and dashboard URLs so responders land
   on the correct runbook and Grafana panels.
4. Emit the generated change event to PagerDuty after the incident webhook is
   authenticated and replay protection passes.

## Response procedure

1. Acknowledge the PagerDuty incident and confirm the generated plan includes the
   expected service, dedup key, severity, runbook, and dashboard links.
2. If the incident is critical, verify canary promotion is frozen before making
   production changes.
3. Review frontend P99 latency, 5xx rate, trace export failures, and
   canary-vs-stable panels. The critical-path target is **< 100ms P99**.
4. Approve rollback to the blue track only when SLO burn continues or the canary
   analysis is unhealthy.
5. Preserve trace IDs, deployment revision, PagerDuty timeline, and dashboard
   snapshots for post-incident review.

## Deployment

Use the existing blue-green strategy: deploy green, route 5% canary traffic,
compare SLO panels for 15 minutes, promote to 25%, then 100%. Any PagerDuty page
or latency burn alert freezes promotion until the incident commander approves a
resume or rollback.
