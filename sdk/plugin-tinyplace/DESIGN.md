# tinyplace — one plugin, any harness

**Goal (user directive):** ONE installable plugin. The user installs it once; it
**detects the harness it's running in** (Codex, Claude Code, or any future one) and
wires itself accordingly — MCP server, hooks, launcher, inbound strategy. No per-harness
package, no manual wiring.

Replaces the two near-identical packages (`plugin-claude` 1280 loc, `plugin-codex`
1333 loc — ~95% shared) with a single `@tinyhumansai/tinyplace-plugin`. The 5% that
differs is isolated into **runtime-selected adapters**.

## How one package serves every harness

```text
                       ┌─────────────────────────────┐
   install once  ───▶  │  @tinyhumansai/tinyplace-*   │
                       │                             │
                       │  detectHarness()  ──────────┼──▶ "codex" | "claude" | …
                       │        │                    │
                       │        ▼                    │
                       │  adapters[harness]  ← the only per-harness deltas
                       │        │                    │
                       │  ┌─────┴──────────────────┐ │
                       │  │ shared core (the 95%)  │ │  20 MCP tools, wallet store,
                       │  │ format/registry/route/ │ │  Signal drain+send, daemon,
                       │  │ daemon/server/outbox   │ │  routing, sessions, contacts
                       │  └────────────────────────┘ │
                       └─────────────────────────────┘
```

### Runtime detection (`mcp/harness.mjs`)

Order: explicit override → harness-specific env signals → default.

| Signal | ⇒ harness |
|--------|-----------|
| `TINYPLACE_HARNESS` set | that value (explicit escape hatch) |
| `CODEX_HOME` / `CODEX_SESSION_ID` / `CODEX_THREAD_ID` present | `codex` |
| `CLAUDE_PLUGIN_ROOT` / `CLAUDE_CODE_SESSION_ID` present | `claude` |
| else | `claude` (safe default; overridable) |

### Adapter — the ONLY per-harness surface

```js
// adapters/<harness>.mjs → one descriptor object
{
  provider: "codex" | "claude",
  dataDirEnv, dataDirDefault,          // ~/.tinyplace-codex vs -claude (or unified ~/.tinyplace)
  sessionLabelPrefix,                  // "codex" / "claude"
  resolveHarnessSessionId(),           // codex: CODEX_* → null→wrapper id; claude: CLAUDE_CODE_SESSION_ID
  inbound: {                           // how new DMs reach a live session
    push: false | { capability, method },   // claude channel (server→client notification)
    pull: true | false,                // codex: surfacing hook + inbox tool
    foregroundInject: true,            // tmux send-keys into the live pane (folds in #212, both harnesses)
  },
  responder: { command, buildArgs(prompt, model, root), defaultModel },  // claude -p | codex exec
  install: { kind: "plugin-dir" | "codex-home", write(ctx) },  // launcher wiring
}
```

Shared core reads `activeAdapter()` once at startup. Push paths no-op when
`inbound.push === false`; hooks/surfacing only wired when `inbound.pull`. Nothing
harness-specific lives in the 20 tools.

### One launcher (`bin/tinyplace.mjs`)

`tinyplace` (no args) → pick/create wallet → **detect or `--harness <x>`** →
- claude → `claude --plugin-dir <self> --dangerously-load-development-channels …`
- codex  → write isolated `CODEX_HOME` (config.toml `[mcp_servers]` + auto-loaded
  `hooks.json`) → `codex --dangerously-bypass-hook-trust`

Already *inside* a harness (server spawned as its MCP child) → just run the MCP server;
detection picks the adapter, no launch.

## Inbound strategy per harness (unified)

| Harness | idle live session | no live session |
|---------|-------------------|-----------------|
| claude | channel push (real-time) OR tmux inject (#212) | isolated `claude -p` |
| codex  | tmux inject (#212) — else surfacing hook next turn | isolated `codex exec` |

`foregroundInject` (tmux) is harness-agnostic → lives in the shared core
(`mcp/foreground-inject.mjs`), gated by a recorded `tmuxPane`. This is exactly sanil's
#212 generalized to one place: the daemon/self drain prefers a `send-keys` trigger into
the routed session's own pane (in-context reply) and only falls back to the isolated
responder when no pane exists — mutually exclusive, so no message is answered twice. To
guarantee a pane exists in any terminal, `bin/tinyplace.mjs` wraps the launch in a
dedicated `tinyplace` tmux socket (for any inject-capable harness) unless already inside
`$TMUX`. Disable with `TINYPLACE_FOREGROUND_RESOLVE=off`; tune the per-pane debounce with
`TINYPLACE_INJECT_COOLDOWN_MS` (default 4000). Injection is verified live on **both**
Claude and Codex (a `send-keys` trigger wakes an idle Codex TUI and it takes the turn);
the Codex launch config pre-trusts the working directory (`[projects."<cwd>"]
trust_level = "trusted"`) so the first trigger isn't swallowed by the first-run
"trust this directory?" dialog.

### Closed-session addressing

Binding is on a **conversation UUID**, not the (reusable) label. `scope.wrapper_session_id`
is a per-conversation id — a fresh uuid per `(session, peer)` minted on first contact
(`registry.resolveConversationUuid`), so peers can't correlate our sessions across
conversations and each relationship is its own thread. It maps to the session's durable
`sessionUuid` via a reverse index (`convUuid → sessionUuid`), and `sessionUuid` maps to
the live session in presence — so an inbound `to_session_uuid` resolves to the exact
local session, **reuse-proof**: a label reclaimed by a different session can never inherit
another's thread. Replies carry `to_session_uuid` (the peer's `wrapper_session_id`),
echoed automatically from the replied-to message (correlated by `in_reply_to`) — the model
never handles uuids. Layering:

```text
wire: tp.from_session (label, display)  scope.wrapper_session_id (convUuid)  tp.to_session_uuid (peer convUuid)
local: convUuid --idx--> sessionUuid --presence--> live session (label, pid, pane)
```

When a message is addressed to a `to_session_uuid`/`to_session` that isn't live, it's held
(the `_unrouted` hold doubles as a grace window): if that session returns within the grace
it's delivered in-context; if not, the daemon sends the sender ONE auto-tagged
`role:"system"` **"session closed"** notice correlated by `in_reply_to` — so a synchronous
`await_reply`/`check_reply` resolves instead of hanging — and terminates the message
(`reapClosedTargets`). A stranger session is never made to answer a thread bound to a
now-closed session. Tune with `TINYPLACE_SESSION_CLOSED_GRACE_MS` (default 5000).

> The isolated headless responder (separate process, empty buffer) still echoes on the
> label, not the conversation uuid — a documented degradation of the fallback path; the
> interactive / foreground-inject path is fully uuid-bound.

## Identity store (shared) + CLI picker

An agent identity is a keypair; which harness drives it is a runtime choice. So wallets
live in ONE shared, CLI-independent store — `~/.tinyplace/wallets.json` (override with
`TINYPLACE_HOME`), read by the launcher, server, daemon, and register via `mcp/wallets.mjs`.
Only sessions/signal/queue/uuids stay per-harness (`harnessDataDir`). First read migrates
any legacy per-harness `wallets.json` (`~/.tinyplace-claude`, `~/.tinyplace-codex`) into the
shared store. The launcher flow is therefore **pick identity → pick CLI → launch**: after a
wallet is chosen, `bin/tinyplace.mjs` offers the installed harnesses (probed on PATH) when
more than one exists and `--harness` wasn't forced, then pins `TINYPLACE_HARNESS` and
re-resolves the adapter for the launch.

## Packaging

Single package, its own `node_modules` (deps: `@tinyhumansai/tinyplace`,
`@modelcontextprotocol/sdk`, `zod`). Excluded from the pnpm workspace like the current
plugins. Relative cross-dir imports of the SDK do NOT resolve without the package's own
install (verified) → keep everything under one package root with one `node_modules`.

## Migration / decoupling (no dependency on #212 or #214)

1. Build `plugin-tinyplace` by merging the two servers → one, threading `activeAdapter()`.
2. Port both test suites → run against the unified package (behavior unchanged).
3. `foregroundInject` is wired into the core adapter slot with the tmux send-keys body
   (#212 generalized to both harnesses) — the daemon, self-drain, launcher, and registry
   all participate; covered by `inject-test.mjs`.
4. `plugin-claude` / `plugin-codex` become thin re-export shims → the unified package (or
   are removed once consumers migrate). Keeps #214/#212 alive during transition.
5. Cross-harness `xplugin-e2e` still green (now: one package, two adapters, same network).

## Launcher (one `bin/tinyplace`)

`bin/tinyplace.mjs` is harness-agnostic: it owns the wallet store, the arrow-key menu,
and the import/register flows, then hands off to `activeAdapter().launch.prepare(ctx)`
for the `{command, args, env}` that boots THIS harness. The per-harness install step
(Claude: point `claude --plugin-dir` at the package; Codex: write an isolated
`CODEX_HOME` with `config.toml` + auto-discovered `hooks.json` + symlinked `auth.json`)
lives entirely inside each adapter's `launch.prepare`. `--harness <name>` (or
`TINYPLACE_HARNESS`) forces the adapter; otherwise it auto-detects. Adding a harness
never touches the launcher.

## Convention for adding a harness (the guardrail)

`adapters/README.md` is the authoring guide — the full field contract table + a
checklist. `adapter-contract-test.mjs` (in `pnpm test`) structurally enforces that
contract for EVERY adapter in the `ADAPTERS` map: a missing/wrong-shaped field, a
shared data dir, a dropped `UNTRUSTED` framing, an inbound with no delivery path, or a
`launch.prepare` that doesn't return a valid plan all fail CI. A new contributor copies
an existing adapter, fills the fields, adds a detection signal, and makes the contract
test green — no core edits, no silent breakage.

## Deferred: shim conversion (step 4 above)

`plugin-codex` is still live as PR #214 and `plugin-claude` is separately published, so
converting them to re-export shims now would conflict with #214 and couple this PR to
its merge timing. This package ships **standalone**; the shim conversion is a follow-up
once #214 lands. The unified package does not import from either old plugin.

## Success criterion

One `npm i @tinyhumansai/tinyplace-plugin` + `tinyplace`. It works in Codex or Claude
with zero harness-specific choices by the user. A new harness = one adapter file.
