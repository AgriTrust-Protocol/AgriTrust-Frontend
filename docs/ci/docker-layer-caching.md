# Docker Layer Caching for CI

AgriTrust Frontend builds its Docker image in GitHub Actions with Docker Buildx and the GitHub Actions cache backend. The workflow is intentionally scoped per branch/ref so dependency, Next.js, and image layers are reused across repeated pushes without sharing untrusted pull request cache writes into protected branches.

## Architecture

- `.github/workflows/docker-image.yml` configures Buildx and `docker/build-push-action` with `cache-from` and `cache-to` using the `gha` backend.
- `Dockerfile` uses BuildKit cache mounts for the npm cache and the Next.js build cache so repeated CI builds avoid re-downloading packages and recompiling unchanged application artifacts.
- `.dockerignore` keeps source-control metadata, local dependencies, build output, logs, and documentation out of the Docker build context to reduce upload time and prevent accidental secret inclusion.
- The production image keeps the existing non-root `nextjs` user and standalone Next.js output to preserve runtime security posture.

## Operational notes

- Pull requests build the image and populate/read the branch-scoped cache, but do not push images to GHCR.
- Pushes to `main` authenticate to GHCR and publish branch/SHA tags.
- If cache corruption is suspected, re-run the workflow after changing the cache `scope` value or clearing GitHub Actions caches for the repository.

## Monitoring and review checklist

- Track workflow duration and Buildx cache-hit lines in GitHub Actions logs after rollout.
- Confirm the Docker build remains under the CI time budget on warm-cache runs.
- Review Dockerfile changes for secret handling and non-root runtime requirements before merging.
