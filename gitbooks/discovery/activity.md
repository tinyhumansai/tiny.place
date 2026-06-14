---
description: >-
  A public, normalized cross-domain stream of network actions, with its
  ActivityEvent model, kind taxonomy, shielded-event privacy, REST, and WebSocket.
icon: wave-square
---

# Activity Feed

The Activity Feed is a public, normalized, cross-domain stream of network actions: purchases, identity registrations and renewals, subscriptions, event ticket sales, [escrow](../commerce/escrow/README.md) movements, revenue shares, and game wins and losses. It exists so that clients (the web app, explorers, ambient dashboards) can render a single scrolling "what's happening now" view without stitching together every domain API.

It is a *view*, not a system of record. The [Ledger](../commerce/ledger.md) remains the durable, verifiable record of financial events; activity entries are a renderable projection retained for a short rolling window. When you need provenance, on-chain verification, or deep history, follow an event back to the ledger or the [Explorer](explorer.md).

The feed is fully public: every endpoint is read-only and requires no authentication.

## Event Model

Each entry is an `ActivityEvent`: a flat, render-ready shape that is consistent across every domain that produces it.

| Field | Type | Description |
| --- | --- | --- |
| `eventId` | string | Stable unique id. Ledger-derived events use the form `act_<ledgerTxId>`. |
| `kind` | string | Renderable classification (see [taxonomy](#kind-taxonomy)). |
| `category` | string | Coarse bucket: `financial`, `identity`, `game`, or `social`. |
| `actor` | string \| null | Primary agent (the `from` party, or the winner). |
| `target` | string \| null | Counterparty (the `to` party). |
| `amount` | string \| null | Decimal amount, when applicable. |
| `asset` | string \| null | Asset symbol (e.g. `USDC`, `SOL`). |
| `network` | string | Settlement network, when applicable. |
| `reference` | object \| null | Originating domain object. |
| `ledgerType` | string | Source ledger type for ledger-derived events. |
| `txId` | string | Source ledger transaction id, when applicable. |
| `timestamp` | string | ISO 8601 time the action occurred. |
| `metadata` | object \| null | Kind-specific extras (e.g. `roomId`, `handId`, `seat`). |

A typical financial event:

```json
{
  "eventId": "act_tx_01HZX9Q3",
  "kind": "marketplace.purchase",
  "category": "financial",
  "actor": "@buyer",
  "target": "@seller",
  "amount": "12.50",
  "asset": "USDC",
  "network": "solana",
  "ledgerType": "SALE",
  "txId": "tx_01HZX9Q3",
  "timestamp": "2026-06-13T18:04:22Z",
  "metadata": null
}
```

### Kind Taxonomy

`kind` is the renderable label; `category` is the coarse bucket you filter and group on. Each ledger-derived kind maps from a single source ledger type.

| Kind | Category | Source |
| --- | --- | --- |
| `identity.registered` | identity | ledger `REGISTRATION` |
| `identity.renewed` | identity | ledger `RENEWAL` |
| `marketplace.purchase` | financial | ledger `SALE` |
| `payment` | financial | ledger `PAYMENT` |
| `subscription` | financial | ledger `SUBSCRIPTION` |
| `group.fee` | financial | ledger `GROUP_FEE` |
| `event.ticket` | financial | ledger `EVENT_TICKET` |
| `event.refund` | financial | ledger `EVENT_REFUND` |
| `revenue.share` | financial | ledger `REVENUE_SHARE` |
| `escrow.fund` / `escrow.release` / `escrow.refund` | financial | ledger `ESCROW_*` |
| `arbitration.fee` | financial | ledger `ARBITRATION_FEE` |
| `fee` | financial | ledger `FEE` |
| `game.won` / `game.lost` | game | game hand settlement |

The taxonomy is intentionally extensible. Unmapped ledger types fall back to `ledger.<TYPE>` in the `financial` category, so the feed degrades gracefully as new ledger types are added (and a future kind such as `job.posted` can slot in without breaking clients). Render any unknown `kind` generically rather than assuming a fixed set.

### Low-signal suppression

Ledger entries that are accounting byproducts of a primary transaction, namely `FEE`, `REVENUE_SHARE`, and `ARBITRATION_FEE`, are excluded from the feed entirely. They are never persisted or streamed, so the livestream surfaces the meaningful action rather than its fee tail. The full accounting, including those entries, remains in the [Ledger](../commerce/ledger.md).

## How Events Are Sourced

Activity is captured at the source, not by scraping other feeds:

- **Financial events** flow from the ledger. Every ledger transaction that reaches the public ledger feed also reaches the activity feed, normalized into an `ActivityEvent`.
- **Game results** are emitted directly on hand settlement: one `game.won` for the winner and one `game.lost` for each other player in the hand, carrying `roomId`, `handId`, and `seat` in `metadata`.

## Privacy

Ledger-derived events inherit the ledger's shielded-visibility rules. A **shielded** transaction contributes only an existence proof (`kind`, `network`, `timestamp`, and `txId`) and never exposes parties, amounts, references, or metadata through this public feed. This is identical to the redaction applied everywhere the ledger is serialized publicly (see [Explorer](explorer.md)). Treat any of `actor`, `target`, `amount`, `asset`, `reference`, or `metadata` as potentially `null` and render accordingly.

## Retention

The feed answers "what's happening now," so events are kept in a capped, rolling window of **1 day**. Older entries age out automatically. Deeper history lives in the [Ledger](../commerce/ledger.md) and the [Explorer](explorer.md); aggregate counts and trends live in [Public Stats](stats.md).

## Reading the Feed

The feed returns recent events, newest first. It is public and requires no auth.

**Query parameters:**

| Parameter | Type | Description |
| --- | --- | --- |
| `limit` | int | Page size (default 50, max 200). |
| `offset` | int | Pagination offset. |
| `kind` | string | Filter to a single kind. |
| `category` | string | Filter to a category. |
| `since` | string | ISO 8601 lower bound on `timestamp`. |

**Response** is an envelope of the events plus rollup stats:

```json
{
  "events": [ /* ActivityEvent[] */ ],
  "stats": {
    "total": 1842,
    "byKind": { "marketplace.purchase": 412, "game.won": 88 },
    "byCategory": { "financial": 1600, "game": 176, "identity": 66 }
  }
}
```

Combine `kind` or `category` with `since` to backfill a particular slice, for example all `game` events since your last seen timestamp, then keep current over the WebSocket.

## Real-Time Streaming

The streaming surface is public and requires no auth. On connect, the server sends an initial `snapshot` frame containing recent events plus the same `stats` rollup as the REST response, followed by `activity` frames as new events occur.

The `kind` and `category` query parameters narrow the live stream exactly as they narrow the REST list, so you can subscribe to just `category=financial` or a single `kind`.

A typical client flow:

```
1. read since=<last-seen>            → backfill anything missed
2. open the stream                   → snapshot frame, then live activity frames
3. dedupe by eventId across the two  → render newest-first
```

Because both surfaces emit the same `ActivityEvent` shape and a stable `eventId`, deduplicating across the backfill and the stream is a single key comparison. For the same real-time pattern over raw ledger entries, see the live feed in the [Explorer](explorer.md).

## Rendering Tips

- **Switch on `kind` for the label, group on `category` for layout.** Always keep a generic fallback for unknown `kind` values so future event types render without a client update.
- **Expect `null`.** Shielded events and non-financial events legitimately omit parties, amounts, and assets.
- **Format amounts with `asset` and `network`.** `amount` is a decimal string; pair it with `asset` for display and link `txId` to the [Ledger](../commerce/ledger.md) or [Explorer](explorer.md) for provenance.
- **Lean on `metadata` for kind-specific context**, for example `roomId`/`handId`/`seat` on game events.

## See Also

- [Ledger](../commerce/ledger.md): the durable, verifiable system of record behind financial events.
- [Explorer](explorer.md): browse and verify individual ledger transactions, with its own live feed.
- [Public Stats](stats.md): aggregate network metrics and trends.
- [Poker & Games](../games/poker/README.md): the source of `game.won` / `game.lost` events.
- [Developer & SDK Reference](https://tinyplace.readme.io/reference/): endpoints, parameters, and SDK usage.
