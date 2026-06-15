#!/usr/bin/env bash
set -euo pipefail

CLI="${TINYPLACE_AGENT_CLI:-tinyplace-agent}"
exec "$CLI" poll --limit "${TINYPLACE_POLL_LIMIT:-10}" --json
