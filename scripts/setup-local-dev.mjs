#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_EXAMPLE = join(ROOT, '.env.example');
const ENV_LOCAL = join(ROOT, '.env.local');

export const requiredNodeMajor = 18;

export function parseArgs(argv) {
  return {
    checkOnly: argv.includes('--check'),
    skipInstall: argv.includes('--skip-install') || argv.includes('--check'),
    forceEnv: argv.includes('--force-env'),
  };
}

export function getNodeMajor(version = process.version) {
  return Number.parseInt(version.replace(/^v/, '').split('.')[0] ?? '0', 10);
}

export function selectPackageManager(root = ROOT) {
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return { name: 'pnpm', install: ['pnpm', 'install', '--frozen-lockfile'] };
  if (existsSync(join(root, 'package-lock.json'))) return { name: 'npm', install: ['npm', 'ci'] };
  return { name: 'npm', install: ['npm', 'install'] };
}

export function readEnvKeys(contents) {
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => line.split('=')[0].trim());
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: ROOT, shell: process.platform === 'win32', ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`);
}

function ensureEnvFile(forceEnv) {
  if (!existsSync(ENV_EXAMPLE)) throw new Error('.env.example is missing; cannot scaffold local environment.');
  if (existsSync(ENV_LOCAL) && !forceEnv) return 'kept';
  copyFileSync(ENV_EXAMPLE, ENV_LOCAL);
  return existsSync(ENV_LOCAL) ? 'created' : 'missing';
}

function validateEnv() {
  const expected = readEnvKeys(readFileSync(ENV_EXAMPLE, 'utf8'));
  const actual = existsSync(ENV_LOCAL) ? new Set(readEnvKeys(readFileSync(ENV_LOCAL, 'utf8'))) : new Set();
  return expected.filter((key) => !actual.has(key));
}

export function createSummary({ nodeMajor, packageManager, envStatus, missingEnvKeys }) {
  return [
    'AgriTrust local development setup complete.',
    `Node.js: ${nodeMajor} (required >= ${requiredNodeMajor})`,
    `Package manager: ${packageManager.name}`,
    `.env.local: ${envStatus}`,
    missingEnvKeys.length ? `Missing env keys: ${missingEnvKeys.join(', ')}` : 'Environment keys: ok',
    '',
    'Next steps:',
    `  ${packageManager.name === 'pnpm' ? 'pnpm dev' : 'npm run dev'}`,
    '  Open http://localhost:3000',
  ].join('\n');
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const nodeMajor = getNodeMajor();
  if (nodeMajor < requiredNodeMajor) throw new Error(`Node.js ${requiredNodeMajor}+ is required. Current version: ${process.version}`);

  const packageManager = selectPackageManager();
  const envStatus = ensureEnvFile(args.forceEnv);
  const missingEnvKeys = validateEnv();

  if (!args.skipInstall) {
    run(packageManager.install[0], packageManager.install.slice(1));
  }

  if (args.checkOnly) {
    run(packageManager.name, ['run', 'lint']);
    run(packageManager.name, ['test']);
  }

  const summary = createSummary({ nodeMajor, packageManager, envStatus, missingEnvKeys });
  console.log(summary);
  if (missingEnvKeys.length > 0) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
