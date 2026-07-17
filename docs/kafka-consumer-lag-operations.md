# Kafka consumer lag monitoring and consumer-group scaling

## Architecture

Each service exports partition-level `agritrust_kafka_consumer_lag_messages` gauges from its Kafka client telemetry. The platform collector scrapes those metrics and exposes a protected, read-only aggregation endpoint at `GET /api/observability/kafka/consumer-lag`. The Operations dashboard polls that endpoint every 30 seconds; it never talks to Kafka directly or exposes Kafka credentials to the browser.

The shared `consumerLag` module validates all labels and numeric input before aggregation or OpenMetrics rendering. It calculates group totals, alert severity, and a deterministic desired replica count. The deployment controller is the only component permitted to apply that decision to an HPA/KEDA `ScaledObject`; use workload identity with permission limited to the target consumer deployment. Keep Kafka authentication and scaler credentials in the workload secret store, never in the frontend.

### Alert policy and dashboard

* **Warning:** total group lag is at or above `scaleUpLag` (default 2,000 messages).
* **Critical:** total group lag is at or above twice `scaleUpLag`.
* Alert labels must include `consumer_group`, service, environment, and runbook URL. Route warning alerts to the on-call queue and critical alerts to paging.
* The Operations dashboard shows total lag, maximum partition lag, membership, status, and freshness. Alert if no sample arrives for two scrape intervals.

### Scaling safety

The recommended policy is 1–12 replicas, target 1,000 lagged records/replica, a five-minute cooldown, and three consecutive healthy samples before scale-down. Scale-up is bounded by `maxReplicas`; scale-down changes at most one replica per evaluation. Persist `lastScaledAt` and healthy-sample state in the scaler/controller store so restarts do not bypass cooldown. The telemetry path is in-memory and deterministic; Kafka polling, controller writes, and dashboard I/O are off the transaction critical path.

## Deployment: blue-green with canary analysis

1. Deploy the telemetry exporter and dashboard endpoint to **green** with the scaler in observe-only mode. Verify label cardinality and authentication.
2. Mirror production metrics to green for at least one cooldown window. Compare lag totals and P99 API latency; critical user paths must remain below 100 ms P99.
3. Enable scaling for one low-risk consumer group (5% canary). For 30 minutes, require no critical lag alert, no unexpected replica oscillation, and error rate within 1% of blue.
4. Expand by consumer group, then shift dashboard traffic. Retain blue and an immediate rollback route until the 99.99% availability SLO window is met.
5. Roll back by disabling controller writes first, pinning replicas to the last known safe count, and shifting traffic to blue. Do not delete metric history during rollback.

## On-call runbook

1. Confirm freshness, consumer membership, and partition skew in Operations. Check broker health and consumer error logs before scaling manually.
2. If lag is critical and consumers are healthy, raise replicas within the approved maximum; verify lag slope decreases for two intervals.
3. If membership does not increase, inspect ACLs, authentication, quotas, rebalances, and partition assignment. Avoid repeated restarts during a rebalance.
4. If a bad deployment causes errors, disable autoscaler writes, pin a safe replica count, and execute the blue-green rollback. Record group, topic, timestamps, lag, and actions in the incident.
5. After recovery, review scaling thresholds, alert noise, maximum partition lag, and security audit logs. Any policy or RBAC change requires security review before production rollout.
