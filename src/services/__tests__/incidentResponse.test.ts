import { describe, expect, it } from "vitest";
import { buildIncidentRunbookPlan, toPagerDutyChangeEvent, type PagerDutyIncidentEvent } from "../incidentResponse";

const baseEvent: PagerDutyIncidentEvent = {
  id: "P12345",
  service: "agritrust-frontend",
  severity: "critical",
  status: "triggered",
  summary: "P99 latency over budget",
  source: "prometheus",
  dedupKey: "frontend-latency-p99",
  createdAt: "2026-07-19T12:00:00.000Z",
  runbookUrl: "https://github.com/AgriTrust-Protocol/AgriTrust-Frontend/blob/main/docs/runbooks/incident-response-pagerduty.md",
  dashboardUrl: "https://grafana.example.com/d/agritrust-frontend",
};

describe("incident response runbook automation", () => {
  it("builds approval-gated rollback actions for critical PagerDuty incidents", () => {
    const plan = buildIncidentRunbookPlan(baseEvent);

    expect(plan.escalationPolicy).toBe("page-primary");
    expect(plan.recommendedActions.map((action) => action.id)).toEqual(["freeze-canary", "rollback-green", "collect-evidence"]);
    expect(plan.recommendedActions.find((action) => action.id === "rollback-green")?.requiresApproval).toBe(true);
    expect(plan.links.pagerDuty).toBe("https://agritrust.pagerduty.com/incidents/P12345");
  });

  it("uses observe-only escalation for informational incidents", () => {
    const plan = buildIncidentRunbookPlan({ ...baseEvent, severity: "info", status: "resolved" });

    expect(plan.escalationPolicy).toBe("observe");
    expect(plan.recommendedActions.every((action) => action.requiresApproval === false)).toBe(true);
  });

  it("converts runbook plans into PagerDuty change events", () => {
    const changeEvent = toPagerDutyChangeEvent(buildIncidentRunbookPlan(baseEvent), "routing-key");

    expect(changeEvent.routing_key).toBe("routing-key");
    expect(changeEvent.payload.custom_details).toMatchObject({
      incident_id: "P12345",
      service: "agritrust-frontend",
      escalation_policy: "page-primary",
    });
    expect(changeEvent.links?.map((link) => link.text)).toEqual(["runbook", "dashboard", "pagerDuty"]);
  });
});
