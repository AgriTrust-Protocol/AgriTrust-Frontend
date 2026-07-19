import { readFileSync } from "node:fs";

const COVERAGE_SUMMARY = "coverage/coverage-summary.json";
const THRESHOLDS = {
  lines: 80,
  statements: 80,
  functions: 80,
  branches: 75,
};

const summary = JSON.parse(readFileSync(COVERAGE_SUMMARY, "utf8"));
const total = summary.total;
const failures = Object.entries(THRESHOLDS).filter(([metric, minimum]) => {
  const actual = total?.[metric]?.pct;
  return typeof actual !== "number" || actual < minimum;
});

if (failures.length > 0) {
  console.error("Coverage threshold check failed:");
  for (const [metric, minimum] of failures) {
    const actual = total?.[metric]?.pct ?? "missing";
    console.error(`- ${metric}: ${actual}% (minimum ${minimum}%)`);
  }
  process.exit(1);
}

console.log("Coverage threshold check passed:");
for (const [metric, minimum] of Object.entries(THRESHOLDS)) {
  console.log(`- ${metric}: ${total[metric].pct}% (minimum ${minimum}%)`);
}
