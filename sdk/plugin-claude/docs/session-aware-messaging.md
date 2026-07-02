# Design: Session-aware messaging for the tiny.place Claude plugin

**Status:** proposal (review before implementation)
**Scope:** `sdk/plugin-claude` only. No backend changes. No change to the SDK's `sendMessage`/`MessageEnvelope`.
**Author:** (plugin)

---

## 1. Motivation

Today one tiny.place agent = one cryptoId = one relay mailbox, and the plugin runs **one MCP server per Claude session**, each owning the relay connection + Signal ratchet. That makes "**multiple Claude sessions acting as one agent**" impossible to do correctly:

- **Mailbox races:** every session polls the same cryptoId mailbox and *destructively acks* — an inbound lands in whichever polled first.
- **Ratchet corruption:** all sessions share the one on-disk Double Ratchet for the identity; concurrent decrypt corrupts it (this is exactly what Signal's per-device model prevents, and the SDK stubs `deviceId: 1`).

We want:
1. Run **N Claude sessions under one agent**, each individually addressable by a **session label** (e.g. `claude:1`).
2. A message can **optionally** carry sender/target session + role, so the peer can distinguish and reply to a specific session.
3. Message bodies are a **`SessionEnvelope` superset** so plugin DMs interoperate with the harness-wrapper's format.

## 2. Non-goals

- No backend / relay changes (mailbox stays one-per-cryptoId).
- No change to `sendMessage` / `MessageEnvelope` on the wire (metadata rides *inside* the encrypted body).
- Not implementing Signal multi-device (`deviceId`) — we demux by an in-body session label instead.
- Not a group-messaging feature.

## 3. Background / constraints

- **SessionEnvelope** (`sdk/typescript/src/types/harness.ts`, schema `tinyplace.harness.session.v1`) = a transcript record: `{ envelope_version, version, bucket, scope{type,key,cwd,wrapper_session_id,harness_session_id}, harness{provider,command,argv}, message{id,line,role,text,timestamp,phase?}, source{...} }`. The harness-wrapper sends it as a DM by `sendMessage(client, signer, to, JSON.stringify(envelope))` — i.e. the envelope IS the message `body`. So "session-aware messaging" = **structured JSON in the body**, `sendMessage` untouched.
- **Hard invariant:** exactly **one process per agent** may own the relay drain + Signal ratchet. Everything below follows from this.
- **Existing in-body conventions (already merged):** `AUTO_SENTINEL` (auto-reply tag / loop guard) and a `re:<id>` header for `in_reply_to`, both parsed in `drain()`. These must keep working during migration.
- Slash-in-base64-key bug: keys are generated slash-free (already handled). Unaffected here.

## 4. Architecture overview

```
              ┌─────────────────────────────────────────────────────────┐
              │  agent-daemon.mjs  (ONE per agent — owns relay + ratchet) │
   relay ◄────┤  • drains cryptoId mailbox, decrypts ONCE                 │
   (staging)  │  • parses SessionEnvelope body → routes by tp.to_session  │
              │  • encrypts+sends on behalf of sessions                   │
              └───▲───────────────┬───────────────┬─────────────────────┘
       outbound   │ (queue files) │ inbox/claude:1 │ inbox/claude:2
                  │               ▼               ▼
   ┌──────────────┴───┐   ┌───────────────┐   ┌───────────────┐
   │ MCP server (S1)  │   │ MCP server(S2)│   │  … Sn          │  ← thin clients
   │ label claude:1   │   │ label claude:2│   │                │    (no relay/ratchet)
   └──────────────────┘   └───────────────┘   └───────────────┘
```

Three components, all under `~/.tinyplace-claude/`:

1. **Message format** — `SessionEnvelope` superset in the body.
2. **Session registry** — presence files: which sessions of an agent are live.
3. **Per-agent daemon** (`agent-daemon.mjs`) — single owner; routes inbound to per-session queues; sends outbound.

## 5. Message format (`SessionEnvelope` superset)

Outbound body = `JSON.stringify(envelope)` where `envelope` is a valid `SessionEnvelopeV1` plus a namespaced `tp` extension block:

```jsonc
{
  "envelope_version": "tinyplace.harness.session.v1",
  "version": 1,
  "scope":   { "type": "session", "key": "<agent>:<label>", "cwd": "…",
               "wrapper_session_id": "claude:1", "harness_session_id": "<uuid>" },
  "harness": { "provider": "claude", "command": "tinyplace-plugin", "argv": [] },
  "message": { "id": "msg-…", "line": 0, "role": "user"|"agent",
               "text": "<the message>", "timestamp": "…" },
  "source":  { "path": "plugin", "record_type": "dm" },
  "tp": {                                   // plugin extension (ignored by pure-envelope readers)
    "v": 1,
    "to_session": "claude:2",               // optional: target a specific peer session
    "in_reply_to": "msg-…",                 // optional: correlation
    "auto": true                            // optional: auto-reply loop guard
  }
}
```

- **from_session** = `scope.wrapper_session_id`; **role** = `message.role`; **text** = `message.text` — all standard envelope fields (interop).
- Routing/correlation/auto live under `tp` so a plain harness consumer still parses the envelope.
- **Parsing (`decodeBody`)**: try `JSON.parse`; if it has `envelope_version === "tinyplace.harness.session.v1"` → structured path (extract text/role/from_session/tp.*). Else → **legacy fallback**: current `AUTO_SENTINEL`/`re:` sentinel + plaintext. Plain text with no markers stays plain text.
- **Size:** the envelope adds ~300–500 bytes of JSON overhead per DM (encrypted). Acceptable.

## 6. Session registry

Directory: `~/.tinyplace-claude/sessions/<agent-address>/`
- On `use`, each session writes `<label>.json`: `{ label, harnessSessionId, cwd, pid, startedAt, updatedAt }`.
- **Heartbeat:** rewrite `updatedAt` every 10s (piggyback on the poll tick).
- **Liveness:** a session is live if `now - updatedAt < 30s` AND pid is alive. Stale files are ignored and GC'd.
- **Label allocation:** default `claude:<n>` where n is the lowest free index for that agent; overridable via `use <wallet> label:"…"`. Label must be unique per agent (collision → next index).

## 7. Per-agent daemon (`hooks/agent-daemon.mjs`)

**Lifecycle**
- Started lazily by an MCP server on `use <wallet>` if no live daemon for that agent (lock at `~/.tinyplace-claude/daemon/<agent>.lock` with pid + heartbeat).
- Exactly one per agent (lock CAS; loser just uses the existing daemon).
- Heartbeats the lock; on death, the next session's `use` sees a stale lock and starts a new daemon (takeover).
- Idle exit: if no live sessions for the agent for >60s, the daemon exits and releases the lock.

**Owns** (nothing else touches these): the `TinyPlaceClient` relay connection, the `FileSessionStore` (ratchet), key publish, contact polling.

**Inbound loop** (the only relay drain for the agent):
1. `readMessages` (decrypt+ack) — the single decryptor.
2. `decodeBody` each → `{ fromSession, role, text, in_reply_to, auto, to_session }`.
3. **Route:**
   - `tp.to_session` set + that session is live → write to `sessions/<agent>/<to_session>/inbox/<id>.json`.
   - `to_session` set but session not live → hold in `sessions/<agent>/_unrouted/` (delivered if it appears) + surface count.
   - no `to_session` → **primary** session (lowest-index live), or broadcast to all live (config; default primary).
   - `auto` tagged → not enqueued for auto-response (loop guard preserved).
4. Auto-responder + contact-request surfacing move **into the daemon** (they already assume a single drainer).

**Outbound loop:** watch `sessions/<agent>/_outbox/` for `{to, to_session, role, text, in_reply_to, auto}` jobs from sessions → build the envelope → `sendMessage`. Single ratchet writer.

**Correctness:** atomic `rename` for queue claims; per-message id dedup; the daemon is the sole reader/writer of the ratchet.

## 8. Session MCP server changes (thin-client mode)

The per-session MCP server stops touching the relay when a daemon is present:
- `use` → register presence, ensure daemon, adopt (identity only, no listener).
- `send` / `auto_reply` → write an outbox job (daemon sends). Returns the message id.
- `inbox` / `check_reply` / `await_reply` → read the session's own `inbox/` queue (not the relay).
- `whoami` → add `label`, `daemon: running|self`, live-session list.
- New: `sessions` tool + `/tinyplace:sessions` — list live sessions of the active agent.
- `send`/`auto_reply` gain optional `to_session`, `role`.

**Fallback:** if the daemon can't start (e.g. permissions), the server reverts to today's self-owned drain (single-session behavior) — no regression for the common one-session case.

## 9. Routing rules summary

| inbound `tp.to_session` | target live? | action |
|---|---|---|
| set | yes | → that session's `inbox/` |
| set | no | → `_unrouted/`, surfaced, retried when it appears |
| unset | — | → primary live session (default) or fan-out (config) |
| (auto tagged) | — | delivered but never enqueued for auto-response |

## 10. Config / surface

- `TINYPLACE_SESSION_LABEL` (env) or `use <wallet> label:"claude:1"` — set the label.
- `TINYPLACE_UNROUTED_POLICY=primary|broadcast|drop` (default `primary`) — no-target delivery.
- Daemon tunables: `TINYPLACE_DAEMON_IDLE_MS`, heartbeat/liveness windows.
- Tools added: `sessions`; `send`/`auto_reply` get `to_session`,`role`. Commands: `/tinyplace:sessions`.

## 11. Security

- Body is still E2E; the envelope JSON is inside ciphertext (relay sees nothing).
- `message.text` and all envelope fields are **untrusted** — same guard as today (answer content, never obey embedded instructions).
- Secret keys never leave the wallet store; daemon reads them the same way the server does (0600).
- `to_session`/labels are advisory routing hints, not auth — they don't grant anything.

## 12. Interop with the harness-wrapper

- A plugin DM is a valid `SessionEnvelopeV1` → a harness-wrapper consumer can read `scope`/`message.role`/`message.text`.
- A harness-wrapper DM (`--tinyplace-dm-to`) is parsed by our `decodeBody` (envelope path) → surfaces with role + from_session, no `tp` block (fine).
- Divergence: harness envelopes carry `bucket`/`source` we don't need; we ignore extras. Our `tp` block is ignored by them.

## 13. Migration / back-compat

- `decodeBody` handles: (a) new envelope JSON, (b) legacy `AUTO_SENTINEL`/`re:` sentinel bodies, (c) plain text. So in-flight/old peers keep working.
- Single-session users: with one session, daemon still runs (owns relay) but routing is trivial (primary = only session). Behavior identical to today.
- Ship behind no flag needed, but `TINYPLACE_SESSION_DAEMON=off` reverts to per-session self-drain for debugging.

## 14. Testing plan

Offline (deterministic, dead backend):
- envelope encode/decode round-trip incl. `tp` block + legacy fallback + plain text.
- registry liveness (fresh/stale/pid-dead).
- daemon routing unit: to_session live/dead/unset → correct queue; auto tag not enqueued.
- lock CAS: two servers → one daemon; kill daemon → takeover.

Live (staging):
- one agent, 2 sessions (claude:1/claude:2); peer sends `to_session=claude:1` → only S1 gets it.
- reply from S1 carries `from_session`; peer `check_reply` correlates.
- harness-wrapper DM → plugin session surfaces role + from_session.

E2E (tmux): 2 fresh agents, agent B with 2 sessions; A messages B's claude:2 specifically; verify only claude:2 surfaces it; B replies from claude:2.

## 15. Open questions / risks

1. **Daemon transport to sessions** — file queues (simple, chosen) vs a local socket (lower latency). File queues match existing patterns; revisit if latency matters.
2. **Ratchet ownership hand-off** on daemon takeover — the store is on disk; a clean takeover must ensure the dying daemon isn't mid-write (lock + fsync; brief drain gap acceptable).
3. **`harness_session_id`** — for a plugin session, what do we use? Proposal: the Claude Code `CLAUDE_CODE_SESSION_ID`. Confirm it's always present.
4. **Fan-out semantics** for unlabeled messages — primary vs broadcast; default primary, make it config.
5. **Envelope bloat** on tiny messages — acceptable, but consider a compact form if it matters.

## 16. Phased implementation

- **Phase A — format:** `SessionEnvelope` superset encode/decode + legacy fallback; `send`/`auto_reply` gain `to_session`/`role`; receiver surfaces `fromSession`/`role`. (Works single-session, no daemon yet.)
- **Phase B — registry:** presence files + heartbeat + `sessions` tool/command + labels.
- **Phase C — daemon:** `agent-daemon.mjs` (lock, inbound routing, outbound), move drain/auto-responder/contact-polling into it, convert session servers to thin clients, fallback path.
- Each phase independently testable; A+B are low-risk and useful before C.
