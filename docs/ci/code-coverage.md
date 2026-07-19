# Code Coverage Thresholds

AgriTrust Frontend enforces code coverage in CI with Vitest's V8 coverage provider. The GitHub Actions workflow runs tests with coverage on every pull request and push to protected development branches, then verifies the generated summary before building the app.

## Thresholds

The current minimum global thresholds are:

| Metric | Minimum |
| --- | ---: |
| Lines | 80% |
| Statements | 80% |
| Functions | 80% |
| Branches | 75% |

These thresholds are defined in `vitest.config.ts` and mirrored in `scripts/check-coverage-thresholds.mjs` so local and CI checks fail consistently.

## Local workflow

Run the same coverage gate used in CI:

```bash
npm run test:coverage
npm run coverage:check
```

The HTML report is written to `coverage/index.html` for local review. Add or update tests when coverage falls below the threshold rather than lowering the minimums.
