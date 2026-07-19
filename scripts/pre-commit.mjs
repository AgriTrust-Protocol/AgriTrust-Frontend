#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const staged = run('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { capture: true })
  .stdout.trim().split('\n').filter(Boolean);

if (process.argv.includes('--verify-config')) {
  assertHookConfig();
  console.log('Pre-commit suite configuration is valid.');
  process.exit(0);
}

if (staged.length === 0) {
  console.log('No staged files; skipping pre-commit quality suite.');
  process.exit(0);
}

assertHookConfig();
scanTextFiles(staged);

const sourceChanged = staged.some((file) => /^(app|src|pages|components|lib|server|utils|hooks|services|stores|types)\/|\.(js|jsx|ts|tsx|mjs|cjs)$/.test(file));
const configChanged = staged.some((file) => /^(package(-lock)?\.json|pnpm-lock\.yaml|tsconfig\.json|eslint\.config\.mjs|next\.config\.)/.test(file));

if (!existsSync('node_modules')) {
  console.warn('node_modules is not installed; skipping npm-based checks in this environment. Run npm install before committing locally.');
  process.exit(0);
}

if (sourceChanged || configChanged) {
  run('npm', ['run', 'lint', '--', '--max-warnings=0']);
  run('npm', ['run', 'typecheck']);
  run('npm', ['test', '--', '--passWithNoTests']);
} else {
  console.log('No source/config changes detected; completed lightweight pre-commit checks.');
}

function assertHookConfig() {
  const hook = readFileSync('.githooks/pre-commit', 'utf8');
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

  if (!hook.includes('npm run quality:precommit')) {
    throw new Error('.githooks/pre-commit must invoke npm run quality:precommit');
  }

  for (const script of ['quality:precommit', 'typecheck', 'prepare']) {
    if (!pkg.scripts?.[script]) {
      throw new Error(`package.json is missing scripts.${script}`);
    }
  }
}

function scanTextFiles(files) {
  const textExtensions = /\.(css|cjs|html|js|json|jsx|md|mjs|scss|ts|tsx|txt|yaml|yml)$/;
  const secretPattern = /(AKIA[0-9A-Z]{16}|-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----|ghp_[A-Za-z0-9_]{36,}|xox[baprs]-[A-Za-z0-9-]+)/;

  for (const file of files.filter((name) => textExtensions.test(name) && existsSync(name))) {
    const contents = readFileSync(file, 'utf8');
    if (/^(<<<<<<<|=======|>>>>>>>) /m.test(contents)) {
      throw new Error(`Merge conflict marker detected in ${file}`);
    }
    if (secretPattern.test(contents)) {
      throw new Error(`Potential secret detected in ${file}`);
    }
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result;
}
