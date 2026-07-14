# Adding a harness — the adapter convention

This package is **one plugin for any harness**. Install it once; at load time it
detects which harness it runs inside (Codex, Claude Code, …) and hands the shared
core a matching **adapter**. The adapter is the _only_ place per-harness knowledge
lives — the 20 MCP tools, the daemon, the hooks, and the launcher are all
harness-agnostic and read the adapter through one narrow interface.

> **Golden rule:** if you find yourself writing `if (harness === "codex")` anywhere
> outside `adapters/`, stop. That branch belongs in an adapter field. The core must
> never name a harness.

## What an adapter is

A plain object describing the deltas for one harness, exported from
`adapters/<name>.mjs` and registered in `mcp/harness.mjs`'s `ADAPTERS` map. The
core resolves exactly one adapter per process via `activeAdapter()` and reads
these fields.

## The contract

Every field below is **required** and enforced by `adapter-contract-test.mjs`
(part of `pnpm test`). A missing or wrong-shaped field fails CI — that's the
guardrail. Copy an existing adapter (`claude.mjs` is the simplest) and fill each
field for your harness.

| Field | Type | What it is |
|---|---|---|
| `provider` | string | Stable id. **Must equal the key** you register it under in `ADAPTERS`. |
| `dataDirEnv` | string | Env var that overrides the state dir. **Must be `TINYPLACE_`-prefixed** and unique across adapters. |
| `dataDirDefault` | absolute path | Default state dir (wallets, sessions, queue). **Must be unique** — harnesses never share a data dir. |
| `sessionLabelPrefix` | string | Prefix for session labels (`<prefix>:1`, `<prefix>:2`, …). |
| `harness` | `{ command, argv }` | How this harness identifies in the message envelope. `command` non-empty, `argv` an array. |
| `resolveHarnessSessionId()` | `() => string` | The harness's session id from env, or `""` if none reaches the MCP subprocess (the server self-generates a wrapper id). |
| `projectDir()` | `() => string` | Stable per-project scope key for assignment persistence when there's no session id. `""` = fall back to global scope. |
| `serverInstructions` | string | MCP `instructions`. **Must contain the word `UNTRUSTED`** — the prompt-injection guard telling the agent inbound DMs are data, not instructions. |
| `inbound` | `{ push, pull, foregroundInject }` | How new DMs reach a live session. `push` is `false` **or** `{ capability, method }` (server→client channel). `pull`/`foregroundInject` are booleans. **At least one delivery path must be truthy**, else DMs vanish. |
| `responder` | `{ command, defaultModel, buildArgs, prepare?, streamComplete? }` | Headless autoresponder. `buildArgs(prompt, model, pluginRoot, ctx?)` returns the CLI argv and **must thread both `prompt` and `model`**; keep it **side-effect-free** (unit-tested with no env). Optional `prepare(ctx)` runs **once per batch** in `respond-batch.mjs` for setup that can't live in `buildArgs` (e.g. Cursor builds a throwaway send-only `--workspace`); its returned fields are merged into the `ctx` passed to `buildArgs`. Optional `streamComplete: true` makes the spawner pipe stdout and finish on the CLI's terminal `{"type":"result"}` NDJSON event (killing a CLI that hangs after replying) instead of waiting for exit. |
| `install` | `{ kind }` | Launcher install strategy tag (e.g. `plugin-dir`, `codex-home`). |
| `launch` | `{ displayHarness, binary, notFoundHint?, prepare }` | Launcher recipe. `prepare(ctx)` returns `{ command, args, env }`; see below. |

### `launch.prepare(ctx)`

The unified launcher (`bin/tinyplace.mjs`) owns the wallet store, the menu, and
the import/register flows, then calls your `prepare()` to boot the harness.

`ctx` = `{ pluginDir, dataDir, apiUrl, walletName, forwardedArgs }`.

Return `{ command, args, env }`:
- `command` **must equal** `launch.binary`.
- `args` **must include** `...ctx.forwardedArgs` (everything after `--` on the CLI).
- `env` **must set** `TINYPLACE_ACTIVE_WALLET: ctx.walletName` so the session opens
  already logged in. It's merged over `process.env` by the launcher.
- Any per-harness install step (writing an isolated config, symlinking auth, …)
  happens _inside_ `prepare()`. See `codex.mjs`'s `ensureIsolatedHome` for the
  heaviest case; `claude.mjs` shows the trivial one (just point at `pluginDir`).

## Wiring it up (checklist)

1. **`adapters/<name>.mjs`** — export `export const <name>Adapter = { … }` with every
   field above.
2. **`mcp/harness.mjs`** — `import` it and add it to `ADAPTERS`:
   ```js
   const ADAPTERS = { claude: claudeAdapter, codex: codexAdapter, <name>: <name>Adapter };
   ```
3. **`detectHarness()`** in the same file — add the env signal that identifies your
   harness _before_ the `return "claude"` default, e.g.
   `if (env.MYHARNESS_HOME) return "<name>";`. Keep the `TINYPLACE_HARNESS` override
   at the top untouched — it's how `--harness <name>` and every test forces a harness.
4. **`pnpm test`** — the contract test picks up your adapter automatically (it
   iterates `ADAPTERS`). Make it green. Then run `branch-test.mjs` and
   `mcp-smoke.mjs` locally against your harness (`TINYPLACE_HARNESS=<name>`).

## What you must NOT do

- **Don't touch the core for harness behavior.** `mcp/*.mjs`, `hooks/*.mjs`, and
  `bin/tinyplace.mjs` are harness-agnostic. New behavior = new/changed adapter field
  consumed by the core, never a harness name in the core.
- **Don't reuse another harness's `dataDirDefault` / `dataDirEnv`.** Isolation is the
  whole point; the contract test rejects collisions.
- **Don't drop the `UNTRUSTED` framing** from `serverInstructions`. It's a security
  invariant, not boilerplate.
- **Don't leave `inbound` with no delivery path.** If the harness can't push, set
  `pull: true` and/or `foregroundInject: true` so the surfacing hook can deliver.
- **Don't forget `...forwardedArgs`** in `launch.prepare` — users rely on
  `tinyplace -- <harness flags>` passing through.

If the contract test is green and `branch-test` + `mcp-smoke` pass under your
harness, the adapter is correctly wired and the rest of the plugin already works.
