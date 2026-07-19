#!/usr/bin/env node
import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gitDir = join(root, '.git');
const source = join(root, '.githooks', 'pre-commit');
const target = join(gitDir, 'hooks', 'pre-commit');

if (!existsSync(gitDir) || !existsSync(source)) {
  process.exit(0);
}

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
chmodSync(target, 0o755);
console.log('Installed AgriTrust pre-commit hook.');
