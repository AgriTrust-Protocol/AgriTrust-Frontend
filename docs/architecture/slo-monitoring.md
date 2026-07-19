# SLO monitoring architecture

AgriTrust frontend SLO monitoring is implemented at the service-mesh boundary so
all browser, API, and synthetic traffic uses the same objective measurements.
Istio request counters provide availability, and request-duration histograms
provide critical-path latency.

## Core objectives

| Objective | Target | Source |
| --- | --- | --- |
| Availability | 99.99% successful requests | `istio_requests_total` |
| Error budget | 0.01% failed requests | Recording rules |
| Critical path latency | P99 < 100ms | `istio_request_duration_milliseconds_bucket` |

## Burn-rate design

Prometheus recording rules normalize every observed error ratio by the 0.01%
monthly error budget. A burn rate of `1` means the service is consuming budget at
exactly the sustainable rate. Multi-window alerts reduce noise while still
paging quickly for severe incidents:

| Alert | Windows | Threshold | Action |
| --- | --- | --- | --- |
| Fast burn | 5m and 1h | 14.4x | Page |
| Sustained burn | 30m and 6h | 6x | Page |
| Slow burn | 2h and 1d | 3x | Ticket |

## Deployment integration

Blue-green and canary deployments must compare stable and candidate service
tracks before promotion. Promotion is blocked when burn rate exceeds 1x, P99
latency exceeds 100ms, or either track has no ready pods.
