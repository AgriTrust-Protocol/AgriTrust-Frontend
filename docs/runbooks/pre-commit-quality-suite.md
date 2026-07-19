# Pre-Commit Quality Suite Runbook

## Purpose

The AgriTrust frontend pre-commit suite prevents avoidable quality, type-safety, and security regressions from entering source control before review.

## Architecture

1. `.githooks/pre-commit` is the Git hook entrypoint and delegates to `npm run quality:precommit`.
2. `scripts/pre-commit.mjs` performs lightweight staged-file checks for merge conflict markers and common secret formats.
3. When source or tooling files are staged and dependencies are installed, the suite runs linting, TypeScript type-checking, and the Vitest suite.
4. `scripts/install-git-hooks.mjs` installs the tracked hook into `.git/hooks/pre-commit` during `npm install` via the `prepare` lifecycle script.

## Local setup

Run the following after cloning the repository:

```sh
npm install
```

The `prepare` script installs the pre-commit hook automatically. To reinstall it manually, run:

```sh
npm run prepare
```

## Manual validation

Use these commands before opening a pull request:

```sh
npm run quality:precommit
npm run lint -- --max-warnings=0
npm run typecheck
npm test -- --passWithNoTests
```

## Monitoring and alerting

Pre-commit hooks run on developer workstations, so they are monitored through CI parity rather than runtime dashboards. CI should execute the same lint, type-check, and test commands and surface failures as pull-request checks. Treat repeated local hook failures as a developer-experience incident and update this runbook with remediation steps.

## Deployment and rollback

The suite is deployed with the branch containing `.githooks/pre-commit`, `scripts/pre-commit.mjs`, and the package scripts. Roll back by reverting that commit. Because the hook only affects local commits, rollback has no production availability impact.

## Troubleshooting

- If the hook is missing, run `npm run prepare`.
- If `node_modules` is missing, run `npm install` and retry the commit.
- If a secret scan fails, remove the credential from the staged file, rotate the exposed secret, and commit only sanitized content.
- If lint, type-check, or test commands fail, fix the reported issues before committing.
