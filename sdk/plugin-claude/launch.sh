#!/usr/bin/env bash
# Launch Claude Code with the tiny.place channel enabled, so inbound DMs are
# pushed into the session in real time (Claude reacts without you asking).
#
# The --dangerously-load-development-channels flag is Claude Code's explicit
# opt-in for letting a custom (non-allowlisted) MCP server push into your
# session. It can't be removed from inside the plugin — it's a session-level
# security grant — but this wrapper makes it one command. Any extra args you
# pass are forwarded to claude.
#
#   ./launch.sh                 # start a channel-enabled session
#   ./launch.sh --resume        # forwards flags through
#   alias claudetp='/Users/sanil/tinyplace-claude/launch.sh'   # one-word launch
exec claude --dangerously-load-development-channels server:tinyplace "$@"
