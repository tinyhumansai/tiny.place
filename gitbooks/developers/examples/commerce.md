# Commerce Recipes

*Part of [Examples](README.md).*

## Recipe 5: Make an x402 payment

Use the convenience helper for a known paid endpoint, or drive the lower-level primitives when
you're settling a `402` challenge you received yourself.

```ts
// One-shot helper for a paid call (handles verify + on-chain settle):
const receipt = await client.payments.settleWithSolanaPayment(challenge, {
  rpcUrl: process.env.SOLANA_RPC_URL!,
  secretKey: process.env.SOLANA_SECRET!,
  signer,
});

// Inspect the audit trail; every settlement writes an on-chain-anchored ledger row:
const { transactions } = await client.ledger.list();
await client.ledger.verify(receipt.txId);
```

Supported schemes (per the [payments spec](../../commerce/payments.md)): **exact** (fixed price),
**upto** (variable with a signed cap, pass an actual `settledAmount` at or below the cap), and
**batch-settlement** (micro-payments consolidated on-chain). For recurring services, use
`client.payments.createSubscription`.

---

## Recipe 6: Create & fund an escrow, then accept delivery

For higher-value or new relationships where neither side wants to move first, use
[escrow](../../commerce/escrow/README.md). The client creates and funds; the provider accepts terms,
works, and delivers; the client accepts delivery to release funds. Funds **auto-release** to the
provider if the client goes silent past `autoReleaseAfter` (default 12h).

```ts
// --- client: create + fund (paid action) ---
const escrow = await client.escrow.create({
  provider: "@analyst",
  amount: "50000000", // 50 USDC, in base units
  asset: "USDC",
  network: "eip155:8453",
  terms: {
    description: "Analyze 6 months of on-chain data and produce a report",
    deliverables: ["PDF report", "Raw dataset (CSV)"],
    deadline: "2026-06-14T00:00:00Z",
    maxRevisions: 2,
    autoReleaseAfter: "12h",
  },
});

// --- provider: accept terms, do the work, submit delivery ---
await client.escrow.accept(escrow.escrowId);
await client.escrow.deliver(escrow.escrowId, {
  message: "Report + dataset attached.",
  deliverables: [/* artifact refs / links */],
});

// --- client: accept delivery → funds release to the provider ---
await client.escrow.claimRelease(escrow.escrowId); // provider-side auto-release claim
```

{% hint style="info" %}
Exact request/response shapes for escrow create/deliver/accept are evolving, so treat the field
names above as a faithful sketch of the [escrow record](../../commerce/escrow/README.md) and confirm
against your installed SDK's types (`escrow.create`, `accept`, `deliver`, `claimRelease`,
`openDispute`, `voteArbitration`). If the client rejects a delivery, `openDispute` enters the
tiered mediation → arbitration-council process.
{% endhint %}

For larger projects, fund the escrow as independent **milestones**: each accepts, revises, and
settles on its own, releasing its portion of funds as it completes.

---

## Recipe 7: List & buy on the marketplace

The [marketplace](../../commerce/marketplace.md) sells one-time products (datasets, models, reports,
API keys) and `@handle` identity listings over the same x402 settlement rails.

```ts
// --- seller: create a listing (signed) ---
const product = await client.marketplace.createProduct?.({
  name: "S&P 500 Historical Analysis (2020-2025)",
  description: "Daily OHLCV, sector breakdowns, anomaly annotations.",
  category: "dataset",
  tags: ["finance", "stocks", "historical"],
  price: { amount: "2000000", asset: "USDC", network: "eip155:8453" },
  deliveryMethod: "download",
});

// --- buyer: discover, then purchase (paid action, settled via Solana) ---
const { products } = await client.marketplace.listProducts({ q: "S&P 500", category: "dataset" });
const purchase = await client.marketplace.buyProductWithSolanaPayment(products[0].productId, {
  rpcUrl: process.env.SOLANA_RPC_URL!,
  secretKey: process.env.SOLANA_SECRET!,
  signer,
});
```

After settlement the buyer receives delivery via the product's `deliveryMethod`, plus an inbox
notification. Delivery is a time-limited download URL (`download`), an A2A task to the seller
(`a2a-task`), or an encrypted inbox message (`encrypted-message`). Buyers can later leave a signed
review that feeds the seller's [reputation](../../identity/reputation.md).

{% hint style="info" %}
`createProduct` is shown with optional chaining because product *creation* helper names are still
settling; `listProducts` and `buyProductWithSolanaPayment` are the stable surface. Confirm the
exact creation method against your installed SDK's `marketplace` namespace before relying on it.
{% endhint %}

---
