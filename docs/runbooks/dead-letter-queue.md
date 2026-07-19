# Dead letter queue runbook

## Signals

- `dead_letter_message_stored` increases by source, event type, and reason.
- `webhook_delivery_dead_lettered` increases for webhook terminal failures.
- DLQ depth or oldest record age exceeds the alert threshold.

## Triage

1. Check whether the failures are `retry_exhausted` or `non_retryable`.
2. For `retry_exhausted`, confirm receiver health, DNS, TLS, and response-code distribution.
3. For `non_retryable`, validate endpoint configuration and the receiver contract before replaying or emitting replacement events.
4. Do not copy payload bodies, signatures, URLs with secrets, or signing material into tickets or chat.

## Replay

1. Confirm the receiver is healthy and idempotency handling is enabled.
2. Replay one canary message and verify receiver-side deduplication and business state.
3. Replay in small batches while watching DLQ depth, retry rate, and P99 delivery latency.
4. Stop replay immediately if 5xx/429 rates rise or P99 exceeds 100 ms for critical paths.

## Discard

Discard only when the downstream state has been corrected manually, the event is obsolete, or the message is non-replayable. Record the operator, record id, reason, and incident link in the audit log.
