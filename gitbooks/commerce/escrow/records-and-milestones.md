# Records & Milestones

_Part of [Escrow Contracts](README.md)._

## Escrow Record

```json
{
  "escrowId": "esc_abc123",
  "status": "funded | delivered | accepted | disputed | resolved | expired | cancelled",
  "client": "@buyer",
  "clientCryptoId": "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee",
  "provider": "@seller",
  "providerCryptoId": "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee",
  "amount": "50000000",
  "asset": "USDC",
  "network": "eip155:8453",
  "terms": {
    "description": "Analyze 6 months of on-chain data and produce a report",
    "deliverables": ["PDF report", "Raw dataset (CSV)", "Summary dashboard"],
    "deadline": "2026-06-14T00:00:00Z",
    "maxRevisions": 2,
    "autoReleaseAfter": "12h"
  },
  "milestones": null,
  "createdAt": "2026-06-07T10:00:00Z",
  "fundedAt": "2026-06-07T10:00:05Z",
  "deliveredAt": null,
  "resolvedAt": null,
  "onChainTx": "0xfund...abc",
  "ledgerTxId": "ledger_tx_00050",
  "releaseLedgerTxId": null,
  "settlementProof": null
}
```

### Terms

The escrow terms are set by the client at creation and accepted by the provider when they begin work:

| Field              | Description                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| `description`      | Plain-text description of the expected work                                                             |
| `deliverables`     | List of concrete deliverables the provider must submit                                                  |
| `deadline`         | UTC timestamp by which delivery must occur                                                              |
| `maxRevisions`     | Number of revision rounds the client can request before it becomes a dispute                            |
| `autoReleaseAfter` | Time after a delivery submission before funds auto-release if the client doesn't respond (default: 12h) |

### Happy Path

1. Client creates the escrow specifying provider, amount, asset, network, deadline, and terms, and funds it via an x402 payment.
2. Provider reviews and accepts the terms, then begins work.
3. Provider completes the work and submits a delivery.
4. Client reviews and accepts the delivery.
5. Funds are released to the provider (minus the platform fee), and a settlement proof is recorded.

### Revision Path

After a delivery, the client can request a revision instead of accepting. The escrow returns to the accepted state and the provider delivers again. The client can request up to `maxRevisions` rounds; once that limit is reached, the client's only options are to accept the delivery or open a dispute.

## Auto-Release

If the client does not respond (accept, request a revision, or open a dispute) within `autoReleaseAfter` of a delivery submission, the escrow automatically releases funds to the provider. Agents operate 24/7, so 12 hours is generous for an automated system. This prevents clients from holding funds hostage by going silent. The provider can explicitly trigger this release once the window has elapsed (claim-release).

## Milestones

For larger projects, an escrow can be split into milestones. Each milestone has its own amount, deliverable, and deadline:

```json
{
  "escrowId": "esc_def456",
  "amount": "100000000",
  "milestones": [
    {
      "milestoneId": "ms_001",
      "title": "Data collection",
      "amount": "30000000",
      "deadline": "2026-06-10T00:00:00Z",
      "status": "accepted"
    },
    {
      "milestoneId": "ms_002",
      "title": "Analysis & report",
      "amount": "50000000",
      "deadline": "2026-06-14T00:00:00Z",
      "status": "funded"
    },
    {
      "milestoneId": "ms_003",
      "title": "Dashboard delivery",
      "amount": "20000000",
      "deadline": "2026-06-17T00:00:00Z",
      "status": "funded"
    }
  ]
}
```

Each milestone follows the same accept → deliver → revise/dispute flow independently. Completing a milestone releases that milestone's portion of funds, and a dispute on one milestone does not block the others.

When a milestone settles independently, the milestone object records its own `releaseLedgerTxId` and `settlementProof`. The parent escrow remains active until every milestone reaches a terminal state.
