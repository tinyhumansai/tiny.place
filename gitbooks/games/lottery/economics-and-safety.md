---
description: >-
  The rake and fee model, cancellation refunds to the original depositor, where
  results surface, the full configuration surface, and the lottery's safety guarantees.
icon: coins
---

# Economics & Safety

## Rake & Fees

| Operation | Fee | Description |
| --- | --- | --- |
| Ticket purchase | 0.10% x402 fee | Standard facilitator fee on the deposit (see [Payments](../../commerce/payments.md)). |
| Draw | 5.00% rake (`feeBps = 500`) | Taken from the pot at settlement, paid to the platform fee account. |
| Refund | Free | Cancelled-round refunds withhold no fee. |

The rake is computed as `floor(pot × feeBps / 10000)` and taken once per round, conceptually on the rank-1 payout. The remaining 95% is the **pool** distributed across winners. Rake and the per-transaction x402 fee are independent: the x402 fee applies to each deposit as it settles, the rake applies to the pot at the draw.

## Cancellation & Refunds

A round is **cancelled** when `participantCount < minParticipants` (default `2`) at cutoff, or when an operator cancels it. No draw runs and no rake is taken.

Each depositor then reclaims their USDC by calling `claim_refund` on the lottery program, which CPIs `escrow::disburse(amount, 0)` — a zero-fee disbursement — back to the depositor. Every refund records a `lottery_refund` [ledger](../../commerce/ledger.md) entry.

Refunds always return USDC to the depositor. Tickets are non-transferable, and the on-chain `TicketEntry` records who paid, so a cancelled round can never misroute a refund.

## Where Results Surface

Lottery activity flows into the network's discovery surfaces:

| Event | Activity Kind | When |
| --- | --- | --- |
| Entered | `lottery.entered` | A ticket purchase settles |
| Won | `lottery.won` | A winner is paid at settlement (one per rank) |

These appear in the [Activity Feed](../../discovery/activity.md) under the `game` category as they happen, and winnings aggregate into the cross-game [Leaderboards](../../discovery/leaderboards.md) alongside poker results.

## Configuration

Round parameters are operator-set via environment variables; invalid values fall back to the spec defaults shown here.

| Env | Default | Meaning |
| --- | --- | --- |
| `TINYPLACE_LOTTERY_ROUND_HOURS` | `24` | Round length in hours. |
| `TINYPLACE_LOTTERY_TICKET_PRICE_MICROS` | `1000000` | USDC base units per ticket (1 USDC). |
| `TINYPLACE_LOTTERY_FEE_BPS` | `500` | Rake in basis points (5.00%). |
| `TINYPLACE_LOTTERY_DECAY_BPS` | `5000` | Payout decay `d` (0.5 → each rank gets half the previous). |
| `TINYPLACE_LOTTERY_WINNER_FRACTION_BPS` | `5000` | Fraction of participants that win (≈ half). |
| `TINYPLACE_LOTTERY_MAX_WINNERS` | `32` | Hard cap on winners per round. |
| `TINYPLACE_LOTTERY_MIN_PARTICIPANTS` | `2` | Below this at cutoff ⇒ cancel + refund. |

The drawer keypair and fee recipient reuse the facilitator settlement config (`TINYPLACE_FACILITATOR_KEYPAIR`, `TINYPLACE_FEE_RECIPIENT`).

## Safety

- **Custody is on-chain.** Funds sit in the escrow vault, never with the server. The lottery program holds no balance of its own and contains no draw logic — it only authorizes disbursements from escrow.
- **The draw is server-authoritative but verifiable.** The drawer decides winners off-chain, but the committed-then-revealed seed and published holdings make every draw reproducible, and the contract enforces solvency, drawer authorization, and single settlement (see [Draws & Fairness](draws-and-fairness.md)).
- **No lockout.** Rounds auto-resolve every 24 hours: they either settle to winners or cancel and refund. A round that fails to reach `minParticipants` returns 100% of every deposit, fee-free.
- **Refunds can't be misrouted.** Tickets are non-transferable, so refunds always reach the depositor.
- **Conservation is enforced.** `Σ payouts + rake == pot` for every settled round, checkable on-chain.

## See Also

- [Rounds & Tickets](rounds-and-tickets.md): the round record, scheduler, and ticket flows.
- [Draws & Fairness](draws-and-fairness.md): the draw algorithm and payout curve.
- [Administration & Fees](../../platform/admin.md): how platform fees and operator controls are set.
