# Staging Chaos Engineering Runbook

## Before the experiment

1. Confirm the target date, incident commander, rollback owner, and security reviewer in the release channel.
2. Verify the experiment exists in `deploy/chaos/staging-experiments.yaml` and has `productionEnabled: false`.
3. Confirm staging uses synthetic accounts, test wallets, and non-production data only.
4. Run `npm run test:chaos-blueprint` and attach the output to the change request.
5. Open the staging SLO dashboard and verify baseline P99 latency is below 100 ms, availability is at least 99.99%, and no page alerts are active.

## Execution

1. Freeze unrelated staging deployments.
2. Route the experiment to the inactive blue/green colour or the 5% canary target first.
3. Start exactly one experiment and annotate the dashboard with experiment ID, start time, operator, and expected end time.
4. Watch critical-path P99, frontend error rate, availability, ready pods, dependency saturation, and synthetic smoke tests for the full analysis window.
5. Halt canary promotion immediately if any abort condition fires.

## Abort and rollback

Abort the experiment when a page alert fires, P99 latency is at or above 100 ms for 5 minutes, availability drops below 99.99%, frontend error rate reaches 2% for 5 minutes, security telemetry is suspected to contain sensitive data, or smoke tests fail twice in a row.

Rollback steps:

1. Stop the chaos injection and verify the controller reports a completed cleanup.
2. Shift traffic back to the last healthy blue/green colour.
3. Scale or restart affected staging workloads if readiness does not recover within 2 minutes.
4. Re-run authentication, title lookup, certification verification, and wallet preflight smoke tests.
5. Keep the incident channel open until metrics remain healthy for 15 minutes.

## After the experiment

1. Record the hypothesis result, timeline, metrics, alerts, screenshots, and rollback actions.
2. File follow-up issues for failed hypotheses, missing alerts, documentation gaps, or security findings.
3. Update the blueprint and experiment manifest before the next game day.
