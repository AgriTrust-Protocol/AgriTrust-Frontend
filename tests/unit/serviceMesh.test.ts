import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readDeploymentFile = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("service mesh deployment contract", () => {
  const mesh = readDeploymentFile("deploy/istio/mesh.yaml");
  const workloads = readDeploymentFile("deploy/kubernetes/deployment.yaml");
  const monitoring = readDeploymentFile("deploy/observability/monitoring.yaml");

  it("enforces mTLS and identity-based ingress authorization", () => {
    expect(mesh).toContain("kind: PeerAuthentication");
    expect(mesh).toContain("mode: STRICT");
    expect(mesh).toContain("mode: ISTIO_MUTUAL");
    expect(mesh).toContain("kind: AuthorizationPolicy");
    expect(mesh).toContain("istio-ingressgateway-service-account");
  });

  it("keeps blue-green tracks and starts traffic on stable", () => {
    expect(workloads).toContain("name: agritrust-frontend-stable");
    expect(workloads).toContain("name: agritrust-frontend-canary");
    expect(mesh).toMatch(/subset: stable[\s\S]*?weight: 100/);
    expect(mesh).toMatch(/subset: canary[\s\S]*?weight: 0/);
    expect(workloads).toContain("/api/health");
  });

  it("defines latency, error, and availability alert signals", () => {
    expect(monitoring).toContain("AgriTrustFrontendHighErrorRate");
    expect(monitoring).toContain("AgriTrustFrontendLatencyBudgetBurn");
    expect(monitoring).toContain("AgriTrustFrontendNoReadyPods");
    expect(monitoring).toContain("> 100");
  });
});
