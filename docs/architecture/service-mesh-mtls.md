# Service mesh with mutual TLS

## Decision

The frontend runs as a non-root, immutable container in the `agritrust`
namespace. Istio sidecar injection is enabled for that namespace and
`PeerAuthentication` is `STRICT`; plaintext pod-to-pod traffic is therefore
rejected. The `DestinationRule` explicitly uses `ISTIO_MUTUAL`, ensuring that
workload certificates issued by Istio CA are used for all in-mesh calls.

```text
Browser -- TLS --> Istio ingress gateway -- mTLS --> frontend Envoy --> Next.js
                                         \-- mTLS --> internal services
Prometheus <------------- Istio telemetry / Envoy request metrics
```

The public TLS certificate terminates at the managed gateway. The gateway must
be enrolled in the mesh. `AuthorizationPolicy` only permits its workload
identity to reach the application port, while the Kubernetes `NetworkPolicy`
provides a second, L3/L4 enforcement layer. This design authenticates service
identities rather than IP addresses and uses automatically rotated workload
certificates; no private key is stored in this repository or mounted in the
application container.

## Reliability and performance

* Stable runs three replicas across the cluster scheduler's normal placement;
  canary is a separate deployment and subset.
* The virtual service begins at 100% stable / 0% canary. Requests have a 10 s
  cap, bounded retries, connection-pool limits, and 5xx outlier ejection.
* The P99 SLO is 100 ms. The alert measures Istio's destination-side request
  duration; use a 5-minute window for rapid rollback and 10 minutes before
  paging to avoid short deployment noise.
* The availability objective is 99.99%. Alert on no ready pods and burn-rate
  alerts from the error ratio. Production should spread replicas across zones
  with a `topologySpreadConstraints` policy supplied by the platform overlay.

## Prerequisites and deployment order

1. Install an Istio revision with a trusted CA and Prometheus collection.
2. Create the `istio-system/public-gateway` gateway and DNS/TLS certificate
   for `agritrust.example.com` in the environment overlay.
3. Replace every `REPLACE_WITH_DIGEST` with an immutable, scanned image digest.
4. Apply `deploy/kubernetes/base.yaml`, then `deployment.yaml`, mesh resources,
   and monitoring resources. Validate with `istioctl analyze -n agritrust`.
5. Confirm `istioctl proxy-config cluster` shows `ISTIO_MUTUAL` before allowing
   ingress traffic.

The placeholder host and gateway are deliberately not production defaults;
environment overlays own public DNS and certificates. This prevents accidental
deployment of a public route during a review.
