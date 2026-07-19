import { appendFile, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const reportsDirectory = process.argv[2] ?? ".lighthouseci";
const budgets = JSON.parse(await readFile(".performance/budgets.json", "utf8"));

async function findReports(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const location = join(directory, entry.name);
    if (entry.isDirectory()) return findReports(location);
    return entry.name.endsWith(".report.json") ? [location] : [];
  }));
  return nested.flat();
}

const reports = await findReports(reportsDirectory);
if (reports.length === 0) throw new Error(`No Lighthouse reports found in ${reportsDirectory}`);

const failures = [];
for (const reportPath of reports) {
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  for (const [audit, budget] of Object.entries(budgets)) {
    const result = audit === "performance"
      ? report.categories.performance
      : report.audits[audit];
    const value = audit === "performance" ? result?.score : result?.numericValue;
    const limit = budget.minScore ?? budget.maxNumericValue;
    const passed = budget.minScore !== undefined ? value >= limit : value <= limit;
    if (!passed) failures.push(`${report.finalUrl}: ${audit} was ${value}, budget is ${JSON.stringify(budget)}`);
  }
}

const summary = `Performance budget checked ${reports.length} Lighthouse reports.`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}
if (failures.length) throw new Error(`Performance regression detected:\n${failures.join("\n")}`);
