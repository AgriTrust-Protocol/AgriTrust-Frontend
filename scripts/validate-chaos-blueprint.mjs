import { readFileSync } from 'node:fs';

const manifest = readFileSync('deploy/chaos/staging-experiments.yaml', 'utf8');
const blueprint = readFileSync('docs/chaos-engineering-staging.md', 'utf8');
const runbook = readFileSync('docs/runbooks/chaos-engineering-staging.md', 'utf8');

const requiredExperimentIds = [
  'frontend-pod-restart',
  'frontend-network-latency',
  'api-5xx-burst',
  'postgres-read-delay',
  'kafka-consumer-pause',
  'cache-eviction',
  'otel-collector-drop',
];

const checks = [
  ['manifest disables production experiments', /productionEnabled:\s*false/.test(manifest)],
  ['manifest limits concurrency to one experiment', /maxConcurrentExperiments:\s*1/.test(manifest)],
  ['manifest requires security approval', /security-reviewer/.test(manifest)],
  ['manifest enforces 100 ms P99 abort condition', /critical_path_p99_ms[\s\S]*threshold:\s*100/.test(manifest)],
  ['manifest enforces 99.99 availability abort condition', /availability_percent[\s\S]*threshold:\s*99\.99/.test(manifest)],
  ['blueprint documents blue-green and canary rollout', /blue-green/i.test(blueprint) && /canary/i.test(blueprint)],
  ['blueprint documents security data handling', /secrets|wallet addresses|account IDs|transaction payloads/i.test(blueprint)],
  ['runbook includes rollback process', /Rollback steps/i.test(runbook)],
];

for (const id of requiredExperimentIds) {
  checks.push([`experiment ${id} is documented in manifest`, manifest.includes(`id: ${id}`)]);
  checks.push([`experiment ${id} is documented in blueprint`, blueprint.includes(`\`${id}\``)]);
}

const failures = checks.filter(([, passed]) => !passed);

for (const [name, passed] of checks) {
  console.log(`${passed ? '✓' : '✗'} ${name}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} chaos blueprint validation checks failed.`);
  process.exit(1);
}

console.log('\nChaos blueprint validation passed.');
