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
| [3. Quick-win wiring](./phase-3-quick-win-wiring.md) | constitution + registry availability (payments/moderation descoped) | ✅ Done | this branch |
| [4. Commerce](./phase-4-commerce.md) | escrow + identity trading | ⬜ Not started | — |
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

_Last updated: 2026-06-12._
