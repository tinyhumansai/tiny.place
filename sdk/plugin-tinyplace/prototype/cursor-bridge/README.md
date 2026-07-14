# Cursor ⇄ OpenHuman bidirectional bridge (prototype)

> **Status: throwaway spike, not production.** This proves an IDE agent (Cursor)
> can be "hijacked" into a live, two-way tiny.place conversation with OpenHuman
> over the Signal-encrypted relay — and documents exactly what does and doesn't
> work, so the real adapter (`adapters/cursor.mjs`) can build on it. It is driven
> entirely by Cursor **hooks** + a small background daemon; it does not modify
> Cursor or OpenHuman.

## What it does

- **Forward (Cursor → OpenHuman):** Cursor's `beforeSubmitPrompt` and
  `afterAgentResponse` hooks observe each turn and send it to OpenHuman as a
  tiny.place `SessionEnvelopeV1` DM. OpenHuman's orchestration ingest classifies
  it as a `cursor` runtime (`harness_type_for`) and renders it as a live session.
- **Reverse (OpenHuman → Cursor):** a background daemon polls the bridge's
  encrypted inbox and, on a new OpenHuman DM, pastes it into Cursor's chat and
  submits — so OpenHuman's messages appear in the **live Cursor GUI** and get
  answered, and the answer flows back to OpenHuman. Full loop.
- **Tool-approval routing (OpenHuman decides):** Cursor's `beforeShellExecution` /
  `beforeMCPExecution` hooks route the approval to OpenHuman — the hook posts a v2
  `approval_request` event (rendered as a native **Allow/Deny card** by OpenHuman)
  and **blocks** until the user replies `allow`/`deny` there, then returns that as
  the hook's permission. So you approve a Cursor tool call from OpenHuman without
  switching to Cursor. On timeout it falls back to Cursor's own prompt (`ask`).

## Architecture

```
Cursor GUI  ──beforeSubmitPrompt/afterAgentResponse hooks──▶  hook.mjs ──Signal DM──▶  OpenHuman
Cursor GUI  ◀──paste+Enter (daemon, macOS automation)──────  daemon.mjs ◀──Signal DM──  OpenHuman
```

| File             | Role                                                                                                                                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `common.mjs`     | Shared SDK wiring (client/signer/FileSessionStore), the `SessionEnvelopeV1` + v2 `approval_request` builders, the cross-process lock, echo-suppression records, and `sendWithRetry` (self-heals a desynced session on a `400`/encrypt error). |
| `hook.mjs`       | The Cursor hook handler. Forwards user/assistant turns; routes `beforeShellExecution`/`beforeMCPExecution` to OpenHuman for approval (blocks for the decision); auto-allows file reads; no-ops on `stop` (reverse is the daemon's job).       |
| `daemon.mjs`     | Long-running reverse-push loop: poll inbox → paste each OpenHuman message into Cursor. Pauses while an approval is pending so the hook owns the decision DM.                                                                                  |
| `postkeys.swift` | Experiment: `CGEventPostToPid` background key injection. **Does not work** for Cursor (see Findings) — kept as evidence.                                                                                                                      |
| `setup.mjs`      | One-time: mint the bridge identity, publish Signal keys, send OpenHuman a contact request.                                                                                                                                                    |

## Setup

1. **Build the SDK** (needs ≥ 2.0.2 for base58 bundle routing):
   ```bash
   pnpm --filter @tinyhumansai/tinyplace build
   ```
2. **Find OpenHuman's tiny.place address** (its base58 cryptoId — shown in the app,
   or in its logs as `[tinyplace] … agent_id=`).
3. **Provision the bridge** (publishes keys + sends a contact request):
   ```bash
   OPENHUMAN_ADDR=<openhuman-cryptoId> node setup.mjs
   ```
   Then **accept the contact request** in the OpenHuman app (the relay is
   contact-gated).
4. **Wire the Cursor hooks.** Create a wrapper that pins env + an absolute node
   path (Cursor gives hooks a sanitized env and an arbitrary cwd):
   ```bash
   # bridge.sh
   #!/bin/bash
   export TINYPLACE_API_URL="https://staging-api.tiny.place"
   export OPENHUMAN_ADDR="<openhuman-cryptoId>"
   export BRIDGE_HOME="$HOME/.tinyplace-cursorbridge"
   export BRIDGE_LOG="/tmp/cursor-bridge.log"
   exec /abs/path/to/node /abs/path/to/hook.mjs
   ```
   `~/.cursor/hooks.json`:
   ```json
   {
     "version": 1,
     "hooks": {
       "beforeSubmitPrompt": [{ "command": "/abs/bridge.sh", "timeout": 30 }],
       "afterAgentResponse": [{ "command": "/abs/bridge.sh", "timeout": 30 }],
       "stop": [{ "command": "/abs/bridge.sh", "timeout": 30 }],
       "beforeShellExecution": [{ "command": "/abs/bridge.sh", "timeout": 300 }],
       "beforeMCPExecution": [{ "command": "/abs/bridge.sh", "timeout": 300 }],
       "beforeReadFile": [{ "command": "/abs/bridge.sh", "timeout": 15 }]
     }
   }
   ```
   **Reload the Cursor window** so it picks up `hooks.json`.
5. **Start the reverse daemon** (same env as the wrapper):
   ```bash
   node daemon.mjs   # polls the inbox; pastes OpenHuman messages into Cursor
   ```

Now chat in Cursor (mirrors to OpenHuman) and message the bridge from OpenHuman
(appears in Cursor, gets answered, answer returns).

## Findings (the point of the spike)

1. **Reverse injection IS possible via the `stop` hook.** Cursor hooks aren't
   observe-only: `stop` / `subagentStop` accept a `{ "followup_message": "…" }`
   result that Cursor **auto-submits** into the live chat. That's the only channel
   that injects text into an ongoing conversation. This prototype ended up using a
   daemon-driven GUI paste instead (see below), but `stop → followup_message`
   works and is the zero-dependency fallback (turn-triggered, not push).

2. **You cannot push into an idle Cursor from outside.** `stop` only fires when a
   turn ends, so pure hook injection needs the user to take a turn. To get instant
   push we drive the GUI (clipboard + `System Events` Cmd+V/Return).

3. **`CGEventPostToPid` does NOT reach a backgrounded Electron window.** We tried
   posting key events straight to Cursor's PID (`postkeys.swift`) to avoid
   foregrounding — Chromium drops synthetic key events unless it's the key window.
   So **there is no zero-focus-steal instant push**: instant delivery requires
   briefly foregrounding Cursor (a ~0.5s flash; we capture and restore the prior
   app so OpenHuman isn't left behind), OR you inject only while Cursor is already
   frontmost (no flash, but not "instant while you're in OpenHuman").

4. **Setting the input's AX value doesn't register in React.** Even when found in
   the Chromium AX tree, `set value of <textfield>` doesn't fire the input events
   Cursor's React app needs, so a subsequent submit sends nothing. Real key events
   (foreground) are required.

5. **Concurrency corrupts the Signal session → HTTP 400.** The daemon (reads the
   inbox, advancing the receive ratchet) and the hook processes (send, advancing
   the send ratchet) share one `FileSessionStore`. Concurrent read+write clobbers
   the Double Ratchet state and the relay rejects the next send with `400`. Fixed
   with a **cross-process mkdir lock** (`withLock` in `common.mjs`) around every
   SDK op that touches the store.

6. **SDK ≥ 2.0.2 is mandatory.** Older builds fetch a peer's pre-key bundle by the
   base64 identity key; a `/` in it becomes `%2F` and 404s on `/keys/:cryptoId/*`.
   2.0.2+ fetches by base58 cryptoId. (This is why the OpenHuman-side "slash-free
   identity" idea was the wrong fix — the routing belongs at the client.)

7. **First-contact ratchet desync** can drop the very first DM; recover with a
   session reset + re-handshake, then resend.

8. **The Signal session between two independently-managed stores is fragile.** The
   app resets its store on restart while the bridge accumulates state, and the
   daemon (reads) + hooks (sends) touch the same store concurrently. Once the
   Double Ratchet diverges, `readMessages` **silently drops** what it can't
   decrypt, so the receiving side never learns to reset — it stays broken until a
   manual re-handshake. `sendWithRetry` self-heals the _sending_ side (reset the
   session + retry on a `400`/encrypt error), but the _receiving_ side has no
   equivalent (you can't retry a silent drop). A production adapter should own
   both identities' stores or add an explicit re-key signal rather than lean on
   two loosely-coupled ratchets.

9. **Approval outcome must be derived, not just local state.** OpenHuman renders
   the resolved Allow/Deny card from the persisted decision message (not only the
   click), so it survives a reload — the button-only version reverted to
   unresolved on remount.

## ⚠️ Security caveats (demo only)

- The Cursor hook config **auto-approves** shell/MCP/file gates so turns don't
  stall on "Waiting for Approval" — meaning an (untrusted) injected OpenHuman
  message can run shell in your workspace. Remove the three `before*Execution` /
  `beforeReadFile` hooks to restore manual approval.
- Messages from OpenHuman are pasted and submitted as prompts; treat them as
  untrusted data. Don't point this at an OpenHuman/peer you don't control.
- This provisions a throwaway wallet under `~/.tinyplace-cursorbridge`.
