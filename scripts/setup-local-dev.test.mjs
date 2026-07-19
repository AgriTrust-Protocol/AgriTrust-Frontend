import { describe, expect, it } from 'vitest';
import { createSummary, getNodeMajor, parseArgs, readEnvKeys, requiredNodeMajor, selectPackageManager } from './setup-local-dev.mjs';

import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('setup-local-dev', () => {
  it('parses check mode as non-installing', () => {
    expect(parseArgs(['--check'])).toEqual({ checkOnly: true, skipInstall: true, forceEnv: false });
  });

  it('reads Node major versions', () => {
    expect(getNodeMajor('v20.11.1')).toBe(20);
    expect(getNodeMajor(`v${requiredNodeMajor}.0.0`)).toBe(requiredNodeMajor);
  });

  it('prefers pnpm when a pnpm lockfile exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'agritrust-setup-'));
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
    expect(selectPackageManager(root).name).toBe('pnpm');
  });

  it('extracts environment keys while ignoring comments and blanks', () => {
    expect(readEnvKeys('# comment\nNEXT_PUBLIC_API_URL=http://localhost\n\nCACHE_ENABLED=false')).toEqual([
      'NEXT_PUBLIC_API_URL',
      'CACHE_ENABLED',
    ]);
  });

  it('builds a concise setup summary', () => {
    const summary = createSummary({
      nodeMajor: 20,
      packageManager: { name: 'pnpm' },
      envStatus: 'created',
      missingEnvKeys: [],
    });

    expect(summary).toContain('AgriTrust local development setup complete.');
    expect(summary).toContain('pnpm dev');
  });
});
