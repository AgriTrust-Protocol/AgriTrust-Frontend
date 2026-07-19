export type IncidentSeverity = "critical" | "error" | "warning" | "info";
export type IncidentStatus = "triggered" | "acknowledged" | "resolved";

export interface PagerDutyIncidentEvent {
  id: string;
  service: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  summary: string;
  source: string;
  dedupKey: string;
  createdAt: string;
  runbookUrl?: string;
  dashboardUrl?: string;
  labels?: Record<string, string>;
}

export interface RunbookAction {
  id: string;
  label: string;
  description: string;
  automated: boolean;
  requiresApproval: boolean;
}

export interface RunbookPlan {
  incidentId: string;
  service: string;
  severity: IncidentSeverity;
  dedupKey: string;
  escalationPolicy: "page-primary" | "notify-channel" | "observe";
  recommendedActions: RunbookAction[];
  links: { runbook?: string; dashboard?: string; pagerDuty?: string };
  createdAt: string;
}

export interface PagerDutyChangeEvent {
  routing_key: string;
  payload: {
    summary: string;
    source: string;
    severity: IncidentSeverity;
    timestamp: string;
    custom_details: Record<string, unknown>;
  };
  links?: Array<{ href: string; text: string }>;
}

const CRITICAL_ACTIONS: RunbookAction[] = [
  {
    id: "freeze-canary",
    label: "Freeze canary promotion",
    description: "Stop rollout automation while SLO burn and PagerDuty state are evaluated.",
    automated: true,
    requiresApproval: false,
  },
  {
    id: "rollback-green",
    label: "Rollback green track",
    description: "Route traffic back to the blue deployment when P99 remains above 100ms or 5xx burn continues.",
    automated: false,
    requiresApproval: true,
  },
  {
    id: "collect-evidence",
    label: "Collect incident evidence",
    description: "Attach trace IDs, dashboard snapshots, alert labels, and deployment revision to the incident timeline.",
    automated: true,
    requiresApproval: false,
  },
];

const NON_CRITICAL_ACTIONS: RunbookAction[] = [
  {
    id: "open-dashboard",
    label: "Open service dashboard",
    description: "Review frontend latency, error budget burn, and canary-vs-stable comparison panels.",
    automated: true,
    requiresApproval: false,
  },
  {
    id: "notify-service-channel",
    label: "Notify service channel",
    description: "Post a structured incident summary for service owners without paging the primary on-call.",
    automated: true,
    requiresApproval: false,
  },
];

export function buildIncidentRunbookPlan(event: PagerDutyIncidentEvent): RunbookPlan {
  const isPage = event.severity === "critical" || event.status === "triggered";
  return {
    incidentId: event.id,
    service: event.service,
    severity: event.severity,
    dedupKey: event.dedupKey,
    escalationPolicy: event.severity === "info" ? "observe" : isPage ? "page-primary" : "notify-channel",
    recommendedActions: isPage ? CRITICAL_ACTIONS : NON_CRITICAL_ACTIONS,
    links: {
      runbook: event.runbookUrl,
      dashboard: event.dashboardUrl,
      pagerDuty: `https://agritrust.pagerduty.com/incidents/${encodeURIComponent(event.id)}`,
    },
    createdAt: event.createdAt,
  };
}

export function toPagerDutyChangeEvent(plan: RunbookPlan, routingKey: string): PagerDutyChangeEvent {
  return {
    routing_key: routingKey,
    payload: {
      summary: `Runbook automation prepared for ${plan.service} incident ${plan.incidentId}`,
      source: "agritrust-frontend-runbook-automation",
      severity: plan.severity,
      timestamp: plan.createdAt,
      custom_details: {
        incident_id: plan.incidentId,
        service: plan.service,
        dedup_key: plan.dedupKey,
        escalation_policy: plan.escalationPolicy,
        actions: plan.recommendedActions.map((action) => ({
          id: action.id,
          automated: action.automated,
          requires_approval: action.requiresApproval,
        })),
      },
    },
    links: Object.entries(plan.links)
      .filter(([, href]) => Boolean(href))
      .map(([text, href]) => ({ text, href: href as string })),
  };
}
