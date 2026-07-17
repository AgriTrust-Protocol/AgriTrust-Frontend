# Webhook delivery architecture

## Boundary and contract

Webhook dispatch runs **only in a trusted service runtime**. Browser code may display delivery status, but must never receive a signing secret or dispatch to a customer-controlled URL. Store endpoint allow-list state, encrypted per-endpoint secrets, idempotency records, and the durable delivery queue in the backend service. The client rejects non-HTTPS, credentialed, localhost, and private IPv4 endpoint URLs; production dispatchers must also enforce their allow-list after DNS resolution and through egress firewall rules to prevent DNS rebinding SSRF.

Each POST body is deterministic canonical JSON. The service sends `webhook-delivery-id`, `idempotency-key`, `webhook-key-id`, `webhook-timestamp`, and `webhook-signature`. The signature is HMAC-SHA-256 over `v1.<timestamp>.<delivery-id>.<body>`. Consumers must validate the signature in constant time, reject timestamps outside five minutes, and deduplicate by `idempotency-key` before processing.

## Delivery behaviour

`WebhookDeliveryService` treats 408, 409, 425, 429, 5xx, and network failures as transient. It makes at most five attempts using bounded exponential backoff (250 ms through 30 seconds) with jitter, honoring numeric `Retry-After`. Other 4xx responses are terminal. Every retry retains the same body, timestamp, signature, delivery id, and idempotency key.

The caller must invoke delivery from a durable outbox worker, not an HTTP request path. Persist every attempt before and after transmission so a worker restart cannot lose a notification. Use one active worker per delivery id and a database uniqueness constraint for `(endpoint_id, event_id)`.

## Observability and alerts

The service emits `webhook_delivery_attempt` and `webhook_delivery_completed` metrics. Tag attempts with status, success, and attempt number; tag completed deliveries with success and total attempts. Dashboard the success rate, p95/p99 attempt duration, retry rate, queue age, and terminal failures per endpoint. Alert when the five-minute success rate is below 99.99%, queue age exceeds 60 seconds, or terminal failures are non-zero for five consecutive minutes. Do not tag metrics with delivery IDs, URLs, payloads, or secrets.

## Deployment and operations

Deploy the worker with blue-green releases: bring up green consumers against the same outbox while blue remains active, validate queue age and signatures with a small canary endpoint, then drain blue. Roll back by stopping green consumers; the durable outbox makes redelivery safe because receiver-side idempotency is mandatory.

### Runbook

1. Investigate queue age, failed endpoint counts, and response-code distribution; never log bodies or signatures.
2. For a receiver outage, leave transient deliveries queued. Contact the receiver after its retry budget is exhausted and offer a controlled replay by event id.
3. For suspected secret exposure, disable the endpoint, rotate its secret/key id, re-enable it, and replay only events generated after the rotation decision.
4. For a signature-verification incident, compare the canonical body and timestamp on both sides and confirm clock synchronization before replaying.
