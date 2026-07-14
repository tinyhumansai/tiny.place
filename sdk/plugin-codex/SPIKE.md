# plugin-codex — P0 spike findings

Port of `sdk/plugin-claude` (sanil-23) to OpenAI Codex CLI. Self-contained (own daemon + TUI).
Cross-provider gateway extraction deferred.

## Codex CLI capabilities (verified on codex-cli 0.142.5)

- **Plugin manager**: `codex plugin add PLUGIN@MARKETPLACE`, `codex plugin marketplace add/list`.
  Marketplace-snapshot based — heavier than Claude's `--plugin-dir`. Deferred to "scale later".
- **MCP client**: `codex mcp add <NAME> --env K=V -- <cmd...>` or `[mcp_servers.<NAME>]` in config.toml
  (`command`, `args`, `env`, `env_vars`, `cwd`, `startup_timeout_sec`). Verify in session with `/mcp`.
  - **PULL-ONLY**: no server-initiated notifications / push / channel. (Claude plugin's real-time
    DM-into-session does NOT translate — see inbound surfacing below.)
- **Hooks**: `hooks.json` (same shape as Claude) or `[hooks]` in config.toml. Events: SessionStart,
  UserPromptSubmit, Stop, PreToolUse, PostToolUse, SubagentStart/Stop, Pre/PostCompact.
  - Stdin JSON: `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `model`,
    `permission_mode`, `turn_id`.
  - `Stop` fires on **turn complete** (not idle); gets `last_assistant_message`; return
    `{decision:"block",reason}` to continue session with reason as next prompt.
  - `SessionStart`/`UserPromptSubmit` can return `{additionalContext}` → injected as developer context.
  - **Trust**: non-managed command hooks require `/hooks` trust. `--dangerously-bypass-hook-trust`
    bypasses for automation (our TUI launcher uses this).
- **Non-interactive**: `codex exec [PROMPT]` (alias `codex e`); reads stdin if no prompt.
  Used by the auto-responder (replaces Claude's `claude -p`).
- **Config overrides**: `-c dotted.key=tomlvalue`, `--enable/--disable <feature>`.
- **Session logs**: JSONL under `~/.codex/sessions/`.

## Install mechanism (MVP = Path B)

- **Path B (MVP)**: TUI writes an isolated `CODEX_HOME` dir with `config.toml`
  (`[mcp_servers.tinyplace]` + inline `[hooks]` or bundled `hooks.json`), launches
  `CODEX_HOME=<dir> codex --dangerously-bypass-hook-trust`. Mirrors Claude launcher's `--plugin-dir`
  isolation. Fully controlled, no marketplace.
- **Path A (later)**: package as a real Codex marketplace plugin (`codex plugin add tinyplace@...`).

## Resolved items

- **O2 (RESOLVED, live codex-cli 0.142.5)**: Codex passes **NO** session-id env to the MCP
  subprocess. Proven by `codex exec` → `whoami` returning `harnessSessionId: null` (all CODEX_*
  vars empty). The MCP server's per-process wrapper id (`tp-codex-<ts>-<hex>`) is the identity for
  harness_session_id/registry/activeStateKey. Assignment `scopeKey()` deliberately does NOT use the
  ephemeral wrapper id (would break auto-adopt across restarts) — it keys on a real Codex session id
  if ever present, else the working directory (stable per project), else global.
- **P2 live-validated**: `codex exec` drove wallet_create → use → whoami against staging.
  `use` published the key bundle + card, registered `codex:1`, connected the WebSocket doorbell
  (`wsConnected:true`), self-drain mode. Full round-trip through a real Codex session works.

## Divergences from plugin-claude (design decisions)

| # | Claude | Codex |
|---|--------|-------|
| Inbound real-time | MCP server→client channel push | **pull-only**: agent polls `inbox` tool + hooks inject new DMs as `additionalContext` on next turn |
| Auto-responder | Stop hook → `claude -p` | Stop hook → `codex exec` (loop-guarded via `auto` flag) |
| Install | `--plugin-dir` | isolated `CODEX_HOME` (mcp+hooks) [Path B] |
| Surface | commands/*.md + skills/*/SKILL.md | AGENTS.md + README (Codex has neither slash-cmd-md nor skills) |
| Config dir | `~/.tinyplace-claude` | `~/.tinyplace-codex` |
| Session label | `claude:n` | `codex:n` |

## P4 status (hooks + auto-responder + inbound surfacing)

- **Stop hook → `dispatch.mjs` → `respond-batch.mjs`**: claims the queued inbound
  batch, spawns one `codex exec --dangerously-bypass-approvals-and-sandbox -m <model>`
  responder per DM that calls `auto_reply` (threaded, `auto`-tagged → loop-guarded).
  Recursion guard `TINYPLACE_NO_AUTORESPOND` on responders. Offline-tested
  (`hooks-test.mjs`, DRYRUN seam). **Not yet live-verified** — the `codex exec`
  responder + hook-trust path needs the P5 isolated `CODEX_HOME` to run.
- **Pull-only inbound surfacing** (`surface-inbound.mjs`, SessionStart +
  UserPromptSubmit): PEEKS routed inboxes, injects unseen DMs as `additionalContext`
  (per-id marker dedups; `inbox` tool still delivers full content). Only meaningful
  in **daemon mode** (inbox files); self-mode buffers inbound in RAM, invisible to
  the separate hook process → agent calls `inbox` directly there.
- **hooks.json** uses `${TINYPLACE_PLUGIN_ROOT}` placeholders → the P5 launcher
  substitutes absolute paths when writing into `CODEX_HOME` (robust regardless of
  Codex hook-command env expansion).

## P5/Door-B live proof (2026-07-03)

Launcher path validated end-to-end via `bin/tinyplace-codex.mjs --wallet cxfresh --
exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.4-mini "…"`:
- isolated `CODEX_HOME` config loaded, MCP `tinyplace` registered, `whoami` + `inbox`
  **completed** (wallet `cxfresh`, session `codex:2`, **mode `daemon`** → P3 daemon
  spawned live), inbox 0/0.
- **All three hooks fired**: SessionStart + UserPromptSubmit (surfacing) + Stop (dispatch).

**Hooks loading (verified):** codex **auto-discovers `$CODEX_HOME/hooks.json`** at
runtime — the Claude-shaped `{"hooks":{"SessionStart":[{"hooks":[{type,command}]}]}}`
file fires as-is, no config key needed. Do NOT add a `hooks` key to `config.toml`: there
it must be an inline `[hooks]` struct (`[[hooks.sessionStart]]` camelCase array-of-tables,
fields `type`/`command`/`timeout`/`async`/`statusMessage`); a path string errors
(`invalid type: string, expected struct HooksToml`). The `hooks = "./hooks.json"` file-ref
form is only valid in a `.codex-plugin/plugin.json` manifest (Path A), not config.toml.

**`codex exec` sandbox note:** exec defaults to `read-only` sandbox + `approval: never`,
which auto-cancels the MCP tool calls ("user cancelled MCP tool call"). Pass
`--dangerously-bypass-approvals-and-sandbox` for non-interactive runs (the auto-responder
already does). Interactive Door B doesn't hit this — it approves tool calls live.

## What ports verbatim (pure, provider-agnostic)

`format.mjs` (provider→"codex"), `routing.mjs`, `registry.mjs` (label prefix), `daemon-lock.mjs`,
`outbox.mjs`, `address.mjs`, `agent-daemon.mjs` (spawn target + dir), `register.mjs`.

## Interop

Both plugins speak `SessionEnvelopeV1` (`tinyplace.harness.session.v1`) → a codex agent and a claude
agent under different identities can DM each other.

- **Cross-plugin E2E (deterministic, committed)**: `xplugin-e2e.mjs` — claude-plugin sender →
  codex-plugin receiver, fresh identities, decrypts to exact plaintext. Green.
- **Cross-harness LIVE (proven 2026-07-03)**: a real Claude session DM was received + decrypted in a
  live Codex session (`from session: claude:1`), against staging.

## Known issue: first-contact ratchet desync (SDK-level)

Intermittently, the FIRST message to a new peer arrives **undecryptable** ("desynced session") — the
sender's X3DH init doesn't match the receiver's stored prekeys. Reproduced across BOTH harnesses, so
it is SDK/relay-level (Signal prekey publish vs fetch race), not plugin logic. Amplified by: repeated
`use` (rotates prekeys), MCP transport restarts (Codex kills a hung server), and the receiver's
in-memory (self-mode) buffer being lost on restart.

**Recovery (works): mutual `reset_session`** — receiver `reset_session(peer, rehandshake:true)`
republishes its bundle; sender then `reset_session(peer, rehandshake:true)` + resend, refetching the
fresh bundle → clean X3DH → decrypts.

**Follow-ups**: (a) P4 auto-recovery should escalate to republish-own-bundle on undecryptable, not
just local reset; (b) prefer **daemon mode** for receivers (durable inbox files survive MCP restarts;
self-mode buffers in RAM and loses drained mail on restart); (c) file upstream: SDK first-contact
prekey race.
