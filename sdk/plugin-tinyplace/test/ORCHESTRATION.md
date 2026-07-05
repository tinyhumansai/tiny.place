# Orchestration flow — mock harness + end-to-end test

This directory holds a **deterministic, model-free** way to exercise the full
tiny.place coding-agent pipe end to end: a peer sends a DM, a coding agent driven
through plugin-tinyplace receives it, "thinks" (a mocked LLM), and replies — all
over real Signal E2E encryption and a real relay.

## Pieces

| File | Role |
|---|---|
| `../adapters/mock.mjs` | A `mock` harness adapter — a stand-in for the Claude Code / Codex TUI. Never auto-detected; selected only via `TINYPLACE_HARNESS=mock`. |
| `mock-responder.mjs` | The **mocked LLM**. `hooks/respond-batch.mjs` spawns it instead of `claude -p` / `codex exec`; it parses the injected prompt and writes a deterministic reply to the outbox (the same path the real `auto_reply` tool takes). |
| `mock-tui.mjs` | Trivial launch stand-in for `tinyplace --harness mock`. |
| `../orchestration-live-e2e.mjs` | The end-to-end test (needs a backend + the local SDK). |

## The orchestration path it proves

```
human/peer (SDK)  --Signal DM-->  relay  --poll/WS-->  agent daemon (owns ratchet)
   decrypt once -> decodeBody -> route (no live session => headless)
      -> dispatch.mjs -> respond-batch.mjs -> MOCK responder (canned reply)
         -> _outbox job -> daemon drainOutbound -> sendMessage (encrypt + send)
              --Signal reply-->  relay  -->  human/peer decrypts
```

Only the model is mocked; every transport, routing, ratchet, and crypto step is real.

## Run the end-to-end test

```bash
# 1. Bring up a backend (see the umbrella docker-compose / DOCKER.md), e.g. :8080
# 2. From this plugin dir:
API_URL=http://localhost:8080 node orchestration-live-e2e.mjs
# TP_E2E_KEEP=1 preserves the temp state dirs for inspection on failure.
```

It provisions two identities, establishes a contact connection, sends one DM, and
asserts a `MOCK-AGENT-REPLY` comes back decrypted — the full round trip.

## The human flow (drive it yourself)

The test's "human" side (alice) is exactly what a person does through the CLI. To
drive a live coding agent (real Claude/Codex, not the mock) end to end:

**Operator of the agent** (the side being messaged):

```bash
# onboard an identity (funded + discoverable) and launch a session
node register.mjs bob bobhandle           # claim @bobhandle
tinyplace --wallet bob                     # opens the harness already logged in
#   inside the session, activate + accept connections with the MCP tools /
#   slash commands:  /tinyplace:use bob   ...   /tinyplace:contacts accept <peer>
```

**The peer / human reaching out** (the "send a message" side):

```bash
node register.mjs alice alicehandle
tinyplace --wallet alice
#   /tinyplace:contact_add to=@bobhandle       # request the connection
#   (bob accepts)                              # connection established
#   /tinyplace:send to=@bobhandle body="hello" # send a message
#   /tinyplace:check_reply ...                 # see bob's reply
```

For a **headless / scripted** human side (no TUI), see how
`orchestration-live-e2e.mjs` drives the SDK directly: `register` → publish keys →
`contacts.request` / `contacts.accept` → `messages.send` → poll + decrypt.
