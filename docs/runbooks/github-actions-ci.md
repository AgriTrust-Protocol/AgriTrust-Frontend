# GitHub Actions CI Runbook

## Symptoms

- Pull request checks remain queued for longer than expected.
- The aggregate `CI result` job fails.
- Documentation-only changes run full application checks.
- Build jobs are slower after dependency or framework upgrades.

## Triage steps

1. Open the failed workflow run and inspect the `CI result` job to identify whether quality or security gates failed.
2. Check the `Detect changes` job outputs to confirm path filtering classified the change correctly.
3. Review cache logs in setup steps for npm and `.next/cache` restore misses.
4. Re-run only failed jobs when failures are caused by transient GitHub-hosted runner issues.
5. For repeated security audit failures, review the vulnerable package path and update or replace the dependency before merging.

## Rollback

1. Revert the commit that changed `.github/workflows/ci.yml`.
2. Confirm branch protection targets a status that exists on the restored workflow.
3. Re-run the latest pull request workflow to verify checks are available again.

## Canary rollout guidance

Treat workflow updates as a CI canary by merging them during low-traffic development windows, watching the first five pull requests after merge, and comparing run duration plus failure rate against the trailing seven-day baseline.
