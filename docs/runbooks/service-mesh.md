# Service mesh operations runbook

## Canary and blue-green release

1. Build, scan, sign, and publish the image by digest. Set the canary image and
   `APP_VERSION`, then wait for `kubectl rollout status deployment/agritrust-frontend-canary -n agritrust`.
2. Confirm the health endpoint returns the expected version and that
   `istioctl proxy-status` reports synced proxies.
3. Change VirtualService weights to 95/5 (stable/canary). Observe error ratio,
   P99 latency, and browser synthetic checks for 15 minutes.
4. Advance to 75/25, 50/50, then 0/100 only when error rate remains below 1%,
   P99 stays below 100 ms, and no security alert fires. Use a 30-minute hold at
   50/50. This is a blue-green cutover because the stable deployment remains
   intact until validation finishes.
5. Promote by updating stable to the validated digest, wait for stable rollout,
   restore traffic to stable, and retain the previous digest for rollback.

## Immediate rollback

Set the VirtualService weights to stable `100` and canary `0`; this is the
fastest rollback and does not wait for a pod rollout. Then collect Envoy access
logs and dashboard links, scale the canary to zero if it is unsafe, and open a
security incident for any mTLS or authorization-policy failure.

## mTLS incident triage

* Check namespace injection: `kubectl get ns agritrust --show-labels`.
* Inspect policy and certificates: `istioctl x describe pod <pod> -n agritrust`
  and `istioctl proxy-config secret <pod> -n agritrust`.
* Verify route and TLS mode: `istioctl proxy-config cluster <pod> -n agritrust`
  and `kubectl get peerauthentication,destinationrule,authorizationpolicy -n agritrust`.
* Do **not** change `STRICT` to `PERMISSIVE` as an emergency workaround.
  Restore the calling workload identity or destination rule instead.

## Alert response

For `HighErrorRate` or `LatencyBudgetBurn`, first compare stable and canary by
the `destination_track` dashboard label. Roll back the canary if it is worse;
otherwise check gateway saturation and downstream dependencies. For
`NoReadyPods`, inspect readiness output and deployment events, then verify the
image digest and mesh sidecar status. Record the incident, affected SLO window,
and rollout weight in the post-incident review.
