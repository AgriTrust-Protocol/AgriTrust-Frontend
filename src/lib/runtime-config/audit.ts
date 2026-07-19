export type RuntimeConfigSeverity = "low" | "medium" | "high" | "critical";

export type RuntimeConfigRule = {
  key: string;
  required?: boolean;
  expected?: string;
  pattern?: RegExp;
  secret?: boolean;
  severity?: RuntimeConfigSeverity;
};

export type RuntimeConfigDrift = {
  key: string;
  severity: RuntimeConfigSeverity;
  reason: "missing" | "unexpected" | "pattern" | "fingerprint";
  expected?: string;
  actual?: string;
};

export type RuntimeConfigAuditResult = {
  service: string;
  version: string;
  environment: string;
  generatedAt: string;
  fingerprint: string;
  compliant: boolean;
  drift: RuntimeConfigDrift[];
  sanitizedConfig: Record<string, string>;
};

export const DEFAULT_RUNTIME_CONFIG_RULES: RuntimeConfigRule[] = [
  { key: "APP_VERSION", required: true, pattern: /^[\w.:-]{1,80}$/, severity: "medium" },
  { key: "NODE_ENV", required: true, pattern: /^(development|test|production)$/, severity: "high" },
  { key: "NEXT_PUBLIC_CAPACITY_LEVEL", pattern: /^(normal|constrained|critical)$/, severity: "high" },
  { key: "NEXT_PUBLIC_OTEL_LOGS_ENDPOINT", pattern: /^https:\/\//, severity: "medium" },
  { key: "NEXT_PUBLIC_WEB_VITALS_ENDPOINT", pattern: /^https:\/\//, severity: "medium" },
  { key: "UPSTASH_REDIS_REST_URL", pattern: /^https:\/\//, secret: true, severity: "high" },
  { key: "UPSTASH_REDIS_REST_TOKEN", secret: true, severity: "critical" },
];

const REDACTED = "[redacted]";
const MISSING = "[missing]";

export function auditRuntimeConfig(options: {
  env: Record<string, string | undefined>;
  service?: string;
  version?: string;
  environment?: string;
  rules?: RuntimeConfigRule[];
  expectedFingerprint?: string;
  now?: Date;
}): RuntimeConfigAuditResult {
  const rules = options.rules ?? DEFAULT_RUNTIME_CONFIG_RULES;
  const sanitizedConfig: Record<string, string> = {};
  const drift: RuntimeConfigDrift[] = [];

  for (const rule of rules) {
    const value = options.env[rule.key];
    const severity = rule.severity ?? "medium";
    sanitizedConfig[rule.key] = rule.secret && value ? REDACTED : value ?? MISSING;

    if (rule.required && !value) {
      drift.push({ key: rule.key, severity, reason: "missing", expected: "configured", actual: MISSING });
      continue;
    }
    if (value && rule.expected !== undefined && value !== rule.expected) {
      drift.push({ key: rule.key, severity, reason: "unexpected", expected: rule.expected, actual: sanitizedConfig[rule.key] });
    }
    if (value && rule.pattern && !rule.pattern.test(value)) {
      drift.push({ key: rule.key, severity, reason: "pattern", expected: String(rule.pattern), actual: sanitizedConfig[rule.key] });
    }
  }

  const fingerprint = fingerprintConfig(sanitizedConfig);
  if (options.expectedFingerprint && options.expectedFingerprint !== fingerprint) {
    drift.push({ key: "runtime_config_fingerprint", severity: "critical", reason: "fingerprint", expected: options.expectedFingerprint, actual: fingerprint });
  }

  return {
    service: options.service ?? "agritrust-frontend",
    version: options.version ?? options.env.APP_VERSION ?? "unknown",
    environment: options.environment ?? options.env.NODE_ENV ?? "unknown",
    generatedAt: (options.now ?? new Date()).toISOString(),
    fingerprint,
    compliant: drift.length === 0,
    drift,
    sanitizedConfig,
  };
}

export function runtimeConfigMetrics(result: RuntimeConfigAuditResult): string {
  const labels = `service="${escapeLabel(result.service)}",environment="${escapeLabel(result.environment)}",version="${escapeLabel(result.version)}"`;
  const critical = result.drift.filter((item) => item.severity === "critical").length;
  return [
    "# HELP agritrust_runtime_config_drift_total Runtime configuration drift findings by severity.",
    "# TYPE agritrust_runtime_config_drift_total gauge",
    `agritrust_runtime_config_drift_total{${labels},severity="critical"} ${critical}`,
    `agritrust_runtime_config_drift_total{${labels},severity="total"} ${result.drift.length}`,
    "# HELP agritrust_runtime_config_compliant Runtime configuration compliance status, 1 means compliant.",
    "# TYPE agritrust_runtime_config_compliant gauge",
    `agritrust_runtime_config_compliant{${labels}} ${result.compliant ? 1 : 0}`,
  ].join("\n");
}

export function fingerprintConfig(config: Record<string, string>): string {
  const payload = Object.keys(config).sort().map((key) => `${key}=${config[key]}`).join("\n");
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= BigInt(payload.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}
