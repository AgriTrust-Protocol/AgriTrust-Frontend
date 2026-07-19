# GitHub Actions CI Optimization Architecture

## Goals

The optimized CI workflow is designed to reduce pull request feedback time while preserving release confidence for AgriTrust Frontend. The workflow parallelizes independent checks, cancels superseded runs, and avoids expensive application jobs for documentation-only changes.

## Workflow design

The `.github/workflows/ci.yml` pipeline uses four layers:

1. **Change detection** determines whether a run affects application code, workflow definitions, or documentation-only files.
2. **Dependency installation warm-up** validates the lockfile install path and primes package and Next.js caches.
3. **Parallel quality gates** run linting, unit tests, and production build jobs independently with `fail-fast` disabled so developers get complete failure feedback from one run.
4. **Security and result aggregation** run dependency audit checks in parallel with quality gates and provide one branch-protection-friendly status.

## Performance strategy

- `concurrency.cancel-in-progress` stops older runs on the same branch when newer commits arrive.
- `actions/setup-node` enables npm dependency caching from the lockfile.
- `actions/cache` persists `.next/cache` across builds using lockfile and source-file hash keys.
- Documentation-only changes skip expensive Node.js checks after path classification.
- Matrix jobs split lint, test, and build work so the critical feedback path is bounded by the slowest check instead of the sum of all checks.

## Availability and rollback

CI changes are isolated to GitHub Actions configuration and documentation. If the optimized workflow blocks delivery, roll back by reverting the workflow commit or temporarily requiring the previous branch protection status while investigating.

## Security controls

The workflow grants read-only repository permissions by default and enables `security-events: write` only for future security-report uploads. Production dependency audit failures at high severity or above block the aggregate CI status.

## Monitoring

Use GitHub Actions run duration, queue duration, cancellation rate, cache hit rate, and failed-job distribution as the primary CI health signals. Alert when median pull request feedback exceeds 10 minutes for three consecutive business hours or when the aggregate CI failure rate doubles relative to the trailing seven-day baseline.
