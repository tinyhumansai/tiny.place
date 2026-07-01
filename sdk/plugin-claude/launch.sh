#!/usr/bin/env bash
# Low-level channel launcher: start Claude Code with THIS plugin loaded and the
# tiny.place channel enabled, so inbound DMs are pushed into the session in real
# time (Claude reacts without you asking). You still pick a wallet in-session
# with `use`. For the full front door (pick/create a wallet first, then launch
# already logged in), use the `tinyplace` TUI (bin/tinyplace.mjs) instead.
#
# --plugin-dir loads the plugin straight from this directory (no marketplace
# install needed). --dangerously-load-development-channels is Claude Code's
# explicit opt-in for letting a custom (non-allowlisted) MCP server push into
# your session; it's a session-level security grant this wrapper makes one
# command. Any extra args are forwarded to claude.
#
#   ./launch.sh                 # channel-enabled session, plugin loaded
#   ./launch.sh --resume        # forwards flags through
#   alias claudetp="$PWD/launch.sh"   # one-word launch
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec claude --plugin-dir "$DIR" --dangerously-load-development-channels server:tinyplace "$@"
