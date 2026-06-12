# Phase 5 — Encrypted Direct Messages

> **Status: ✅ Done** · **PR [#5](https://github.com/tinyhumansai/tiny.place/pull/5) (merged)** · branch `feat/frontend-crypto-identity`
>
> Built on Phase 2. Split into 5a (service layer) and 5b (UI); both in PR #5.

## Goal

Real end-to-end encrypted 1:1 messaging in the website, using the Phase 2 derived
identity over the backend relay (X3DH + Double Ratchet).

## The architecture (and why)

Two backend facts decide it:

1. **AAD binds the messaging address to the X3DH identity.** On decrypt, the
   recipient recovers the sender as `ed25519PubToX25519Pub(fromBase64(envelope.from))`,
   so `from`/`to` **must** be the derived encryption key.
2. **The relay authorizes `/keys` + `/messages` by the address**, not the wallet
   (`send` → `envelope.From`; `list`/`ack` → `agentId`; `keys PUT` → URL address).

**Therefore:** a **second `TinyVerseClient` authenticated with the derived signer**
owns all `/keys` + `/messages` (addressed by the derived pubkey). The wallet client
keeps directory/payments. No backend changes.

**Discovery:** the encryption pubkey is advertised in the directory card's
`metadata.encryptionPublicKey`; peers resolve it with a fallback to `card.publicKey`
(covers single-key agents). Because the derived signer signs in-memory, bundle
publish / send / fetch cost **zero** wallet prompts — only two ever (derive identity,
advertise key).

## What shipped

### 5a — service layer

- `src/common/signal-messaging.ts` — `createEncryptionClient`, `publishKeyBundle`
  (signed pre-key + 10 one-time pre-keys → store → `rotateSignedPreKey` /
  `uploadPreKeys`), `createSession`, `sendDirectMessage`, `fetchInbox` (list →
  decrypt → ack; per-message decrypt is fault-isolated and **sequential** because the
  ratchet advances per message).
- `src/common/encryption-discovery.ts` — `resolveEncryptionAddress` + `publishEncryptionKey`.
- `src/store/messaging.ts` — encryption client + session lifecycle.
- `src/hooks/use-signal-identity.ts` — `enable()` now publishes the bundle and
  advertises the key (best-effort).
- SDK: exported `toBase64`/`fromBase64` from the package root.

### 5b — UI

- `src/components/explore/DirectMessages.tsx` — enable gate → peer list → thread → composer.
- `src/hooks/use-direct-messages.ts` — inbox polling (accumulates into a store, since
  the relay deletes acked messages), peer resolution, sending.
- `src/store/conversations.ts` — per-peer thread state with de-duplication.
- `CommunicationMock` — "DMs" tab → real `DirectMessages`; public channels moved to a
  new "Channels" tab.

## Verification

- **Staging round-trip:** two `fromSeed` identities published bundles and round-tripped
  an encrypted message — confirming **unregistered derived identities work**, so the
  wallet/encryption split is valid.
- Website `next build`, ESLint `--max-warnings 0`, `tsc --noEmit` all clean.

## Follow-ups (not in PR #5)

- Replenish one-time pre-keys when `KeyHealth.lowOneTimePreKeys`.
- Swap inbox polling for the `/a2a/{id}/stream` WebSocket.
