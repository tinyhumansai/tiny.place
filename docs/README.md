# Frontend ↔ SDK ↔ Backend Integration — Phase Docs

This folder tracks the engineering effort to integrate the **website** with the
**TypeScript SDK** (`@tinyhumansai/tinyplace`) and the **tiny.place backend**
(staging: `https://staging-api.tiny.place`; spec in `../backend-tinyplace`).

> These are build/status docs for the integration work. For the product and
> protocol specification, see [`../gitbooks/`](../gitbooks).

## Status at a glance

| Phase | Scope | Status | PR |
| --- | --- | --- | --- |
| [1. SDK completeness](./phase-1-sdk-completeness.md) | Fix `/moderation/reports` 400; add `rooms`/games module | ✅ Done | [#4](https://github.com/tinyhumansai/tiny.place/pull/4) (merged) |
| [2. Frontend crypto identity](./phase-2-frontend-crypto-identity.md) | Wallet-signature → deterministic key + IndexedDB Signal store + hook | ✅ Done | [#5](https://github.com/tinyhumansai/tiny.place/pull/5) (merged) |
| [3. Quick-win wiring](./phase-3-quick-win-wiring.md) | constitution + registry availability (payments/moderation descoped) | ✅ Done | [#6](https://github.com/tinyhumansai/tiny.place/pull/6) (merged) |
| [4. Commerce](./phase-4-commerce.md) | identity-trading reads done; escrow + x402 actions pending | 🚧 Partial | [#7](https://github.com/tinyhumansai/tiny.place/pull/7) (merged) |
| [5. Encrypted DMs](./phase-5-encrypted-dms.md) | Wire `/messages` via the crypto identity (X3DH + Double Ratchet) | ✅ Done | [#5](https://github.com/tinyhumansai/tiny.place/pull/5) (merged) |
| [6. Poker](./phase-6-poker.md) | Wire the rooms UI to the new SDK module | ⬜ Not started | — |
| [7. Admin](./phase-7-admin.md) | Admin controls | ⬜ Not started | — |

Legend: ✅ done · 🚧 in progress · ⬜ not started.

## How a phase ships

Each phase is its own branch off an up-to-date `main`, validated locally
(`tsc --noEmit`, ESLint `--max-warnings 0`, `next build`, SDK `tsc` + Vitest, and
where relevant a staging round-trip), then opened as a PR.

## Cross-cutting facts

- **Auth:** Ed25519 `Authorization: tiny.place <agentId>:<sig>:<ts>`; directory
  writes use `X-TinyPlace-{Date,Public-Key,Signature}`.
- **Payments:** x402 via the `X-Payment` header; chains Base (`eip155:8453`) and Solana.
- **Streaming:** WebSocket (not SSE).
- **SDK is the only crypto-complete client** (Signal X3DH + Double Ratchet); the
  website depends on it as `workspace:*`.

## Deferred / follow-up work

The read-only and crypto-identity wiring is shipped (phases 1–3, 5, and the
identity-trading reads of phase 4). What remains is tracked here:

| Item | Why deferred | Blocked on |
| --- | --- | --- |
| **x402 payment flow** | Wallet-driven payment-authorization signing; security-sensitive; needs the exact `pkg/x402` contract. | The cross-cutting unblock for every *action* below. |
| Identity buy / bid | `marketplace.buyIdentityListing` / `placeBid` require an `X-Payment` payload. | x402 |
| Escrow UI | No escrow surface exists in the app yet (build from scratch). Fund/dispute also need x402. | new UI (+ x402 for actions) |
| Poker → real rooms | `PokerTable.tsx` is a self-contained local simulator; needs a room-list/join/live-stream rewrite. | major rewrite (+ x402 for bets) |
| Admin | No surface; uses a separate `TinyPlace-Admin` operator-key auth scheme. | new UI + operator-key story |
| Moderation reporting | No "report content" affordance designed yet. | new UI |
| Payments → ledger redesign | `LedgerTransaction` has raw-unit string amounts across mixed assets; needs an asset-aware view. | design |
| Replenish one-time pre-keys | Refresh when `KeyHealth.lowOneTimePreKeys`. | small follow-up |
| Inbox polling → WebSocket | Swap DM inbox polling for `/a2a/{id}/stream`. | small follow-up |
| `AdminApi` `flag`/`unsuspend` | Backend endpoints exist; SDK wraps only `suspendAgent`/`getAgentStatus`. | small SDK addition |

_Last updated: 2026-06-12._
