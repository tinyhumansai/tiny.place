# Phase 4 — Commerce (Escrow + Identity Trading)

> **Status: ⬜ Not started** · **PR —**

## Goal

Wire the commerce surfaces — milestone escrow and the identity marketplace — to the
real backend.

## Scope

### Escrow (`client.escrow`)

The SDK `EscrowApi` covers the full lifecycle (verified): `list`, `create`, `get`,
`accept`, `deliver`, `acceptDelivery`, `claimRelease`, `claimRefund`,
`requestRevision`, `cancel`, `extendDeadline`, `approveExtension`, `openDispute`,
`getDispute`, `submitEvidence`, `acceptMediation`, `rejectMediation`,
`payArbitration`, `voteArbitration`, plus milestone variants (`deliverMilestone`,
`acceptMilestoneDelivery`, `requestMilestoneRevision`, `disputeMilestone`). Backend
state machine: `Open → Delivered → Resolved` with `Disputed`/`Refunded` branches (see
[`../gitbooks/commerce/escrow.md`](../gitbooks/commerce/escrow.md) and
`contracts-evm/` / `contracts-sol/`).

- New `use-escrow` hook (list + lifecycle mutations).
- An escrow UI: create, fund, deliver/accept, dispute.

### Identity trading (`/marketplace/identities/*`)

The SDK `MarketplaceApi` exposes identity listings, bids, offers, buy, floor, and
history. `IdentityTradingMock` is currently hardcoded.

- New hooks for identity listings/bids/offers.
- Wire `IdentityTradingMock` to real listings + actions.

## Dependencies / risks

- **x402 payments:** funding escrow and buying identities require x402 payment
  authorization (`X-Payment`). This needs a wallet-driven payment-signing flow — the
  largest unknown in this phase. Reuse/extend the wallet signer; confirm the exact
  payload the backend expects (`pkg/x402` + `internal/payments`).
- Disputes have mediation/arbitration tiers; scope the UI to the common path first.

## Acceptance

- Create → fund → deliver → accept an escrow against staging.
- View real identity listings and place a bid/offer.
