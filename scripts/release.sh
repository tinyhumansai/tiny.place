#!/usr/bin/env bash
set -euo pipefail

# Frontend release helper.
#
# Bumps the version of the selected targets (SDKs and/or the website), commits
# the change, and — when the website is among the targets — creates an annotated
# `website-vX.Y.Z` tag. Publishing each SDK to its registry and deploying the
# website to Vercel happen in CI; this script only prepares the release commit
# and tag.
#
# It mirrors backend/scripts/release.sh and is normally invoked by the manual
# "Release" GitHub Actions workflow, but works locally too.

usage() {
  cat <<'USAGE'
Usage:
  scripts/release.sh --bump <patch|minor|major> --targets "<list>" [--push] [--dry-run] [--remote <name>]

  --targets   space- or comma-separated subset of: typescript python rust website
  --push      push the release commit (HEAD) and the website tag to the remote
  --dry-run   print planned changes and revert any file edits
  --remote    git remote to push/check tags against (default: origin)

Examples:
  scripts/release.sh --bump patch --targets "typescript python"
  scripts/release.sh --bump minor --targets website --push
  scripts/release.sh --bump major --targets "typescript website" --dry-run
USAGE
}

die() {
  echo "release: $*" >&2
  exit 1
}

bump=""
targets_raw=""
push_release=0
dry_run=0
remote="origin"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bump)
      [[ $# -ge 2 ]] || die "--bump requires a value"
      bump="$2"
      shift 2
      ;;
    --targets)
      [[ $# -ge 2 ]] || die "--targets requires a value"
      targets_raw="$2"
      shift 2
      ;;
    --push)
      push_release=1
      shift
      ;;
    --dry-run)
      dry_run=1
      shift
      ;;
    --remote)
      [[ $# -ge 2 ]] || die "--remote requires a value"
      remote="$2"
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

case "$bump" in
  patch | minor | major) ;;
  *)
    usage >&2
    die "--bump must be patch, minor, or major (got '${bump:-}')"
    ;;
esac

# Normalise targets to a sorted, de-duplicated, space-separated list.
read -r -a targets <<<"$(echo "$targets_raw" | tr ',' ' ' | tr -s ' ')"
[[ ${#targets[@]} -gt 0 ]] || die "--targets must name at least one of: typescript python rust website"

valid_target() {
  case "$1" in
    typescript | python | rust | website) return 0 ;;
    *) return 1 ;;
  esac
}

want_website=0
for t in "${targets[@]}"; do
  valid_target "$t" || die "unknown target '$t' (valid: typescript python rust website)"
  [[ "$t" == "website" ]] && want_website=1
done

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

[[ -f sdk/bump-versions.mjs ]] || die "sdk/bump-versions.mjs is missing; run from the frontend repo"

if [[ -n "$(git status --porcelain)" ]]; then
  die "working tree is dirty; commit or stash unrelated changes before releasing"
fi

only_csv="$(IFS=,; echo "${targets[*]}")"

# Run the bump and capture the human-readable "name: old -> new" summary.
summary="$(node sdk/bump-versions.mjs "$bump" --only "$only_csv")"
echo "$summary"

# Files each target may have touched. Stage only what changed.
declare -a touched=()
for t in "${targets[@]}"; do
  case "$t" in
    typescript) touched+=("sdk/typescript/package.json") ;;
    python) touched+=("sdk/python/pyproject.toml") ;;
    rust) touched+=("sdk/rust/Cargo.toml" "sdk/rust/Cargo.lock") ;;
    website) touched+=("website/package.json") ;;
  esac
done

changed="$(git status --porcelain -- "${touched[@]}")"
[[ -n "$changed" ]] || die "bump did not change any version files"

website_tag=""
if [[ "$want_website" -eq 1 ]]; then
  website_version="$(node -e 'process.stdout.write(require("./website/package.json").version)')"
  [[ "$website_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "website version must be X.Y.Z, got '$website_version'"
  website_tag="website-v${website_version}"
  if git rev-parse -q --verify "refs/tags/${website_tag}" >/dev/null; then
    die "tag ${website_tag} already exists locally"
  fi
  if git ls-remote --exit-code --tags "$remote" "refs/tags/${website_tag}" >/dev/null 2>&1; then
    die "tag ${website_tag} already exists on ${remote}"
  fi
fi

if [[ "$dry_run" -eq 1 ]]; then
  git diff -- "${touched[@]}"
  git checkout -- "${touched[@]}"
  echo "release: dry run complete; reverted version file changes"
  [[ -n "$website_tag" ]] && echo "release: would create tag ${website_tag}"
  exit 0
fi

git add -- "${touched[@]}"

# Conventional-commit message; commitlint runs in husky on local commits.
commit_targets="$(IFS=,; echo "${targets[*]}")"
git commit -m "chore(release): bump ${commit_targets} (${bump})"

release_sha="$(git rev-parse HEAD)"

if [[ -n "$website_tag" ]]; then
  git tag -a "$website_tag" -m "Release ${website_tag}"
  echo "release: created tag ${website_tag}"
fi

# Emit machine-readable outputs for the GitHub Actions workflow.
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "sha=${release_sha}"
    echo "website_tag=${website_tag}"
    echo "targets=${commit_targets}"
  } >>"$GITHUB_OUTPUT"
fi

echo "release: committed ${release_sha} for targets ${commit_targets}"

if [[ "$push_release" -eq 1 ]]; then
  git push "$remote" HEAD
  [[ -n "$website_tag" ]] && git push "$remote" "$website_tag"
  echo "release: pushed HEAD${website_tag:+ and ${website_tag}}"
else
  echo "release: not pushed. Run 'git push ${remote} HEAD${website_tag:+ && git push ${remote} ${website_tag}}' to publish."
fi
