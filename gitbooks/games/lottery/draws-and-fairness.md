---
description: >-
  Commit-reveal seeds, the ticket-weighted competing-exponential draw, the geometric
  payout curve, how to reproduce a draw, on-chain settlement, and live spectating.
icon: scale-balanced
---

# Draws & Fairness

The draw is **provably fair** and **fully reproducible**: the server commits to a secret before any ticket is sold, reveals it at the draw, and publishes the holdings snapshot with the settled round. From `(secret, roundId, holdings)` anyone can recompute the exact winners and payouts and reconcile them against the on-chain transfers.

## Commit-Reveal Seed

When a round opens, the server generates a random 32-byte `secret` and publishes only its commitment:

```
seedCommit = sha256(secret)        // published at open
```

The secret stays hidden (the API redacts it) for the entire 24-hour buying window, so no one — including the server — can know the draw outcome while tickets are still being sold. At the draw the server **reveals** `secret`; anyone can check `sha256(secret) == seedCommit` to confirm it is the same value committed up front and was not chosen after seeing the final holdings.

## The Draw

At cutoff the drawer snapshots `holdings` (owner → ticket count) and selects a rank order by a **ticket-weighted draw without replacement**, implemented with competing exponentials:

```
u(h)   = be_uint64( sha256(secret ‖ roundId ‖ id(h))[0:8] ) / 2^64     // uniform in [0,1)
key(h) = −ln(1 − u(h)) / tickets(h)
draw order = holders sorted by ascending key(h)                        // first = rank 1
```

- `id(h)` is the holder's `cryptoId` when present, otherwise the owner handle — whatever is bound into the digest is what makes the draw reproducible.
- Dividing by `tickets(h)` is the weighting: more tickets lowers a holder's expected key, so they tend to be drawn **earlier** — but a low random `u` can still put a single-ticket holder first. **Rank 1 is whoever is drawn first, never "the largest holder."**
- Ties (and the degenerate `u → 1`) break deterministically on holder identity, so the order is stable across any correct implementation.

### Winner Count

Not everyone wins. The number of ranks paid is:

```
N = clamp( ceil(participants × winnerFractionBps / 10000), 1, maxWinners )
```

capped by the number of distinct holders, then trimmed by dropping any trailing rank whose payout rounds to zero. With the defaults (`winnerFractionBps = 5000`, `maxWinners = 32`), **about half the participants win**, up to a hard cap of 32.

### Payout Curve

The pool (95% of the pot) is split geometrically with decay `d = decayBps / 10000 = 0.5`:

```
payout(rank i) = floor( pool × (1 − d) · d^(i−1) / (1 − d^N) )     for i = 1..N
```

Each rank receives **half of the previous rank** (`payout_{i+1} / payout_i = d`). The `1 − d^N` denominator normalizes the finite series so the shares sum to the whole pool; for large `N` this approaches a clean halving:

| Rank | Share of pool (large N) |
| ---- | ----------------------- |
| 1    | ~50%                    |
| 2    | ~25%                    |
| 3    | ~12.5%                  |
| 4    | ~6.25%                  |
| …    | halving each rank       |

All arithmetic is done in exact rationals (`big.Rat`) then floored to base units, so it is portable and bit-reproducible. Any rounding **dust** (`pool − Σ payouts`) is added to **rank 1**, guaranteeing conservation:

```
Σ (winner payouts) + rake == pot
```

### Worked Example

A round closes with 4 participants holding 6 tickets — `@alice` 3, `@bob` 1, `@carol` 1, `@dave` 1 — for a pot of `6.000000 USDC`.

```
rake = floor(6_000_000 × 500 / 10_000) = 300_000        (5%)
pool = 6_000_000 − 300_000             = 5_700_000
N    = clamp(ceil(4 × 5000 / 10_000), 1, 32) = 2          (≈ half of 4)
```

Reveal `secret`, then compute each holder's key (illustrative `u` values):

| Holder | tickets | u(h) | key = −ln(1−u)/tickets |
| ------ | ------- | ---- | ---------------------- |
| @carol | 1       | 0.12 | 0.1278                 |
| @alice | 3       | 0.40 | 0.1703                 |
| @bob   | 1       | 0.30 | 0.3567                 |
| @dave  | 1       | 0.55 | 0.7985                 |

Ascending key → draw order `@carol, @alice, @bob, @dave`. The first `N = 2` are the winners:

```
payout(1) = floor(5_700_000 × 0.5      / 0.75) = 3_800_000   → @carol  (1 ticket, rank 1)
payout(2) = floor(5_700_000 × 0.25     / 0.75) = 1_900_000   → @alice  (3 tickets, rank 2)
3_800_000 + 1_900_000 + 300_000 == 6_000_000 ✓
```

`@alice`'s three tickets gave her the second-lowest key even with a middling `u`, but `@carol`'s lucky draw took rank 1. That is the asymmetric luck the game is built around.

## On-Chain Settlement

The selection and amounts above are computed off-chain by the authorized **drawer** (server-authoritative). Settlement then moves the money on-chain via the `settlement_game_lottery` program:

```
begin_draw(roundId)
settle_winner(payout_i, fee)     // once per winner; rake passed as `fee` on rank 1
finalize(roundId)
```

The contract does not run the draw — it enforces only **solvency** (no disbursement exceeds the vault), **drawer authorization** (only the drawer key can settle), and **state** (a round settles once). Each `settle_winner` produces a `lottery_payout` [ledger](../../commerce/ledger.md) entry; the rake produces a `lottery_rake` entry; and each winner emits a `lottery.won` [activity](../../discovery/activity.md) event.

## Reproducing a Draw

Given any `settled` round record, an independent auditor can recompute everything:

1. Verify `sha256(secret) == seedCommit`.
2. From the published `holdings`, compute `u(h)` and `key(h)` for every holder.
3. Sort ascending by key to get the draw order; take `N` from the round parameters.
4. Apply the geometric payout formula to `pool = pot − rake`.
5. Confirm the result matches `winners[]` and that each `txHash` settled the stated amount on-chain.

## Spectating & Live Updates

`GET /lottery/stream` is a public WebSocket (observer mode, no auth). It sends a `lottery.snapshot` of the current open round, then streams:

| Event | Payload |
| --- | --- |
| `lottery.snapshot` | `{ round }` — the open round at subscribe time |
| `round_opened` | `{ roundId, cutoffAt, seedCommit }` |
| `pot_update` | `{ roundId, potMicros, ticketCount, participantCount }` |
| `round_settled` | `{ roundId, winners, rakeMicros, secret }` |
| `round_cancelled` | `{ roundId }` |

## Round History

Settled rounds are permanent and queryable. Because each carries its `secret`, `holdings`, and `winners`, every past draw stays independently verifiable.

| Endpoint | Returns |
| --- | --- |
| `GET /lottery/rounds?status=&limit=&offset=` | Paged list of past rounds |
| `GET /lottery/rounds/{roundId}` | One round; full `secret` + `holdings` + `winners` once settled |

## See Also

- [Rounds & Tickets](rounds-and-tickets.md): the round record and how tickets get in.
- [Economics & Safety](economics-and-safety.md): rake, refunds, and configuration.
- [Developer & SDK Reference](https://tinyplace.readme.io/reference/): endpoints, parameters, and SDK usage.
