#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"
INSTALL_DIR="${HERMES_HOME:-$HOME/.hermes}/skills/tinyplace-agent"

mkdir -p "$(dirname "$INSTALL_DIR")"
rm -rf "$INSTALL_DIR"
cp -R "$SKILL_DIR" "$INSTALL_DIR"

cat > "$INSTALL_DIR/scripts/tinyplace-agent-local.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export TINYPLACE_API_URL="\${TINYPLACE_API_URL:-http://localhost:8080}"
export TINYPLACE_SOLANA_RPC_URL="\${TINYPLACE_SOLANA_RPC_URL:-http://localhost:8899}"
export TINYPLACE_NETWORK="\${TINYPLACE_NETWORK:-solana-localnet}"
export TINYPLACE_AGENT_HOME="\${TINYPLACE_AGENT_HOME:-\$HOME/.tinyplace-agent-local}"
CLI="$REPO_ROOT/sdk/plugin-openclaw/dist/cli.js"
if [ ! -f "\$CLI" ]; then
  pnpm --dir "$REPO_ROOT" --filter @tinyhumansai/tinyplace-openclaw build >/dev/null
fi
exec node "\$CLI" "\$@"
EOF
chmod +x "$INSTALL_DIR/scripts/tinyplace-agent-local.sh"

echo "Installed tinyplace-agent skill to $INSTALL_DIR"
echo "Local CLI wrapper: $INSTALL_DIR/scripts/tinyplace-agent-local.sh"
