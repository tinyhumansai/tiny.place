# Releasing the frontend

All publishing is **manual and consolidated** into a single GitHub Actions
workflow: **Release** (`.github/workflows/release.yml`, `workflow_dispatch`).

## How to cut a release

1. GitHub → **Actions → Release → Run workflow**.
2. Tick the targets you want to ship (each is an independent checkbox):
   - **typescript** → `@tinyhumansai/tinyplace` to npm
   - **python** → `tinyplace` to PyPI
   - **rust** → `tinyplace` to crates.io
   - **website** → GitHub Release + Vercel production deploy
3. Pick the **bump** (`patch` | `minor` | `major`) applied to the selected targets.
4. Run.

### What happens

The `prepare` job bumps only the selected packages
(`scripts/release.sh --bump <bump> --targets "<list>"`, which calls
`sdk/bump-versions.mjs --only <list>`), commits to `main`, and pushes. Then:

- Each selected **SDK** is built/tested and published to its registry from the
  exact release commit.
- If **website** was selected, a `website-vX.Y.Z` tag (from `website/package.json`)
  is pushed. The **Deploy Website** workflow (`deploy-website.yml`) then runs
  `vercel pull/build/deploy --prod` and creates a GitHub Release with generated
  notes. **SDK releases do not get GitHub Releases** — only the website does.

Vercel's git auto-deploy is disabled (`vercel.json` → `git.deploymentEnabled:
false`), so commits to `main` no longer trigger production builds — the website
ships **only** on a `website-v*` tag (per
<https://vercel.com/kb/guide/can-you-deploy-based-on-tags-releases-on-vercel>).

> The release run pushes the website tag with `GITHUB_TOKEN`, which by design
> cannot trigger the `push:` tag workflow, so the release run invokes
> `deploy-website.yml` directly via `workflow_call`. Pushing a `website-v*` tag
> manually (or via a PAT) also triggers it through the `push:` event.

## Required secrets (GitHub → Settings → Secrets, `Production` environment)

| Secret | Used by |
| --- | --- |
| `NPM_TOKEN` | TypeScript SDK publish |
| `PYPI_API_TOKEN` | Python SDK publish |
| `CARGO_REGISTRY_TOKEN` | Rust SDK publish |
| `VERCEL_TOKEN` | website deploy (Vercel CLI) |
| `VERCEL_ORG_ID` | website deploy (from `.vercel/project.json`) |
| `VERCEL_PROJECT_ID` | website deploy (from `.vercel/project.json`) |

## Local dry run

```bash
# preview version changes without writing/committing:
node sdk/bump-versions.mjs minor --only typescript,website --dry-run
scripts/release.sh --bump patch --targets "typescript website" --dry-run
```
