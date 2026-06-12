# Phase 2 — Frontend Crypto Identity

> **Status: ✅ Done** · **PR [#5](https://github.com/tinyhumansai/tiny.place/pull/5) (merged)** · branch `feat/frontend-crypto-identity`
>
> Shipped together with Phase 5 in PR #5 (it is the foundation that unblocks DMs).

## Goal

Give the browser an end-to-end encryption identity for the Signal Protocol, since a
Phantom wallet cannot expose the Ed25519 seed needed to derive the X25519 key.

## The decision

Derive a **deterministic** encryption identity from a **one-time wallet signature**
(chosen over a random local key or skipping E2E): the wallet still owns API auth and
payments; this derived key owns Signal. Because it's derived from a fixed-message
signature, it is recoverable on any device the wallet can sign from.

```
wallet.signMessage(FIXED_MSG) → SHA-256 → 32-byte Ed25519 seed
  → LocalSigner.fromSeed(seed) → { Ed25519 signer, X25519 keypair }
  → persisted in IndexedDB (keyed by wallet agent id)
```

## What shipped

### SDK: `LocalSigner.fromSeed(seed)`

`sdk/typescript/src/local-signer.ts` — builds a deterministic signer from a 32-byte
Ed25519 seed (PKCS#8-wrapped `importKey`), reusing the existing `getX25519KeyPair()`
so the derived X25519 key matches what X3DH expects. Unit-tested
(`tests/local-signer.test.ts`) for determinism, signature validity, and the
invariant `x25519Pub == ed25519PubToX25519Pub(ed25519Pub)`.

### Website

- `src/common/signal-identity.ts` — `loadOrCreateSignalIdentity(walletAgentId, signMessage)`:
  derive the seed, persist it, and return `{ signer, identityKeyPair, identityPublicKey, store }`.
- `src/common/signal-store.ts` — `IndexedDbSessionStore` implementing the SDK
  `SessionStore`: persists the signed pre-key, one-time pre-keys, and ratchet
  sessions across reloads, namespaced per wallet. Relies on structured clone for
  `Uint8Array`/`Map`, so no manual serialization.
- `src/store/signal.ts` + `src/hooks/use-signal-identity.ts` — lifecycle: derive on
  demand, reset on wallet disconnect. (Extended in Phase 5a to also publish the key
  bundle and advertise the encryption key.)

## Why a persistent session store matters

The first inbound `PREKEY_BUNDLE` message is answered with the recipient's stored
signed/one-time pre-keys, and the Double Ratchet state must survive reloads to keep
decrypting a conversation — hence IndexedDB rather than the SDK's `MemorySessionStore`.

## Files

- SDK: `local-signer.ts`, `tests/local-signer.test.ts`, `index.ts` (export `fromSeed` path)
- Website: `common/{signal-identity,signal-store}.ts`, `store/signal.ts`,
  `hooks/use-signal-identity.ts`

## Verification

- SDK `tsc` build + `fromSeed` unit tests pass.
- Website `tsc --noEmit` + ESLint clean.
- End-to-end behavior validated in Phase 5 (staging round-trip).
