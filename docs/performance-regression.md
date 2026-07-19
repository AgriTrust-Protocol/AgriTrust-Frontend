# Performance regression detection

## Architecture

The pipeline has two complementary controls:

1. The **Performance Regression Detection** workflow builds the production Next.js bundle, serves it locally, and runs three Lighthouse samples for every protected-branch pull request and `main` push. `scripts/check-performance-budget.mjs` reads the generated LHR files and fails the check when a tracked budget is exceeded. Its reports are retained as CI evidence for 30 days.
2. `WebVitalsReporter` sends production browser measurements only when `NEXT_PUBLIC_WEB_VITALS_ENDPOINT` is configured. It includes the metric, rating, pathname, and timestamp; it does not send query strings, wallet addresses, or other user identifiers. The receiving observability service must aggregate critical-path request durations by route using `evaluateCriticalPath` and alert when P99 is **greater than or equal to 100 ms**.

The checked-in budgets in `.performance/budgets.json` are deliberately versioned and reviewable. Lowering a budget requires the same security and performance review as application code. The synthetic `server-response-time` budget enforces the critical-path 100 ms target; the other metrics protect user-perceived performance.

## Monitoring dashboard and alerts

Create a dashboard with the following route-labelled panels:

| Panel | Source | Alert |
| --- | --- | --- |
| Critical-path P99 latency | Browser/RUM or edge request duration | Page the on-call engineer when P99 is >=100 ms for 5 minutes. |
| Availability | Synthetic probe success rate | Page when rolling 30-day availability projects below 99.99%; ticket at 99.995%. |
| LCP and TTFB | `WebVitalsReporter` | Ticket when either exceeds its agreed budget for 15 minutes. |
| CI budget failures | GitHub Actions workflow conclusion | Notify the pull-request author and block merge. |

Use route templates rather than raw paths in dashboard labels to prevent high-cardinality or sensitive data. Alert payloads should link to the CI artifact or trace ID, not include request bodies.

## Deployment and rollback

1. Build an immutable artifact and complete dependency/security scanning before deployment.
2. Deploy it to the inactive (green) environment, run the same Lighthouse budget workflow and authenticated smoke tests against green, then switch 5% of traffic to green.
3. Compare green versus blue for error rate, availability, and P99 latency for at least 15 minutes. Promote only if green meets the 100 ms P99 target, has no error-rate increase, and availability remains on the 99.99% trajectory.
4. Increase traffic in 25%, 50%, and 100% canary steps. Stop at any alert threshold; switch all traffic back to blue, preserve the dashboard and CI artifacts, and open an incident.
5. Keep blue available until the next release has completed its observation window. Rollback is a traffic switch, not an in-place mutation.

## Incident runbook

1. Acknowledge the alert, identify the affected route and deployment version, and check the canary comparison.
2. If a release correlates with the regression, halt promotion and shift traffic to blue. If not, check upstream API, CDN, and wallet-provider dependencies.
3. Attach Lighthouse reports, P99 graphs, and the rollback decision to the incident. Do not add customer identifiers to incident notes.
4. After recovery, add or tighten a versioned budget/test that would have detected the failure before release.
