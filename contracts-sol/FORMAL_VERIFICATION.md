# Formal Verification — tiny.place settlement contracts

This document defines the safety **invariants** the on-chain programs must
uphold, and maps each to its enforcement point in code, its **Kani** proof
harness, and its unit test. The custody program (`escrow`) is the focus: it is
the only program that holds funds, so its solvency is the property that matters
most.

## Approach

Money-handling arithmetic is extracted into pure, runtime-independent functions
(`programs/*/src/math.rs`) that the instruction handlers call. This lets us:

- **Unit-test** them on the host (`cargo test`) — fast, runs in CI today.
- **Formally verify** them with [Kani](https://model-checking.github.io/kani/),
  a bit-precise bounded model checker for Rust. Kani explores _all_ possible
  `u64`/`u16` inputs symbolically and proves the assertions hold for every one,
  rather than the handful a unit test samples.

Because the handlers call the same functions, the verified logic is the
deployed logic. Properties that depend on the Solana runtime (signer/PDA checks,
state transitions) are enforced by Anchor account constraints + `require!` and
are listed below as **constraint-enforced**; they are candidates for the
TS integration suite (`tests/`) once a validator is available.

## Status

Last verified on the Anchor 1.0.2 / Solana 3.1.10 toolchain:

- **Kani:** 6/6 proof harnesses verified, 0 failures (escrow 3, settlement_job 2,
  settlement_game_poker 1) — including the direct `disbursed + total` add proven
  overflow-free.
- **cargo-fuzz (libFuzzer):** no crashes — `disburse` ~43.6M execs, `rake` ~6.9M,
  `pot_split` ~7.0M.
- **`cargo test`:** 20/20 host unit + fuzz tests.
- **`anchor test`:** 13/13 integration + e2e against a local validator.

## Running the proofs

```bash
cargo install --locked kani-verifier && cargo kani setup     # one-time
cd contracts-sol
cargo kani -p escrow                  # solvency, no-overspend, replay-safety
cargo kani -p settlement_job          # conservation, no-fee-on-refund
cargo kani -p settlement_game_poker   # pot conservation
```

Unit tests + randomized fuzz loops (no extra tooling — the `fuzz_*` tests run
200k deterministic iterations each):

```bash
cargo test --manifest-path contracts-sol/Cargo.toml
```

Coverage-guided fuzzing (libFuzzer, needs nightly + `cargo install cargo-fuzz`):

```bash
cd contracts-sol
cargo +nightly fuzz run disburse    # escrow solvency / no-overspend
cargo +nightly fuzz run rake        # job fund conservation
cargo +nightly fuzz run pot_split   # poker pot conservation
```

## Coverage

```bash
cargo llvm-cov --manifest-path contracts-sol/Cargo.toml --summary-only
```

The pure `math` modules — the funds-handling arithmetic — are at **100%**
region/line coverage and are additionally proven by Kani. The instruction
handlers in each `lib.rs` are not exercised by host `cargo test` (they require
the Solana runtime: `Clock`, CPI, account constraints), so their line coverage
is ~0% here. Covering them requires the Anchor integration suite in `tests/`
(`escrow.ts`, `settlement_job.ts`, `settlement_game_poker.ts`) run against a
local validator:

```bash
cd contracts-sol && npm install && anchor test
```

That suite exercises the happy paths plus the _constraint-enforced_ invariants
below (authority/PDA checks, state-machine transitions, replay/expiry, winner
eligibility, min-players, refund integrity). It needs the Solana + Anchor
toolchain installed, so it is not run in the host CI used for the math
coverage above.

## Invariants

### Escrow (custody)

| ID                         | Invariant                                                                                                                                                                                             | Enforcement                                                                                                                                     | Proof / test                                                                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E1 Solvency**            | A vault's `disbursed` never exceeds `deposited`; `disbursed` is monotonically non-decreasing.                                                                                                         | `math::apply_disburse` is the sole writer of `disbursed`.                                                                                       | Kani `disburse_preserves_solvency`; test `disburse_never_exceeds_deposited`                                                                                |
| **E2 No overspend**        | Each disburse releases `amount + fee ≤ deposited − disbursed` (the available balance).                                                                                                                | `math::apply_disburse` returns `None` otherwise → `InsufficientFunds`.                                                                          | Kani `disburse_never_overspends`; test `disburse_rejects_overspend`                                                                                        |
| **E3 No overflow**         | Vault accounting never wraps. Input-dependent sums use `checked_*` (graceful reject); a sum proven safe by the surrounding guards (`disbursed + total`) is direct and verified overflow-free by Kani. | `math::apply_disburse`.                                                                                                                         | Kani `disburse_preserves_solvency` (checks overflow over full `u64` domain); tests `disburse_rejects_overflow`, `disburse_rejects_inconsistent_accounting` |
| **E4 Replay safety**       | A deposit `nonce` is accepted only if strictly greater than the payer's last; replays/stale nonces are rejected.                                                                                      | `math::nonce_ok` gate in `deposit`.                                                                                                             | Kani `nonce_rejects_replay`; test `nonce_monotonic`                                                                                                        |
| **E5 Authorized disburse** | `disburse` succeeds only when signed by the vault's bound settlement authority.                                                                                                                       | `require!(authority.key() == vault.authority)`; `vault.authority` is fixed at `create_vault` to `PDA(["vault_authority"], settlement_program)`. | constraint-enforced (TS integration)                                                                                                                       |
| **E6 Fee routing**         | Fees can only be sent to the vault's registered `fee_account`.                                                                                                                                        | `require!(fee_token.key() == vault.fee_account)`.                                                                                               | constraint-enforced (TS integration)                                                                                                                       |
| **E7 Vault isolation**     | Every deposit and disburse uses the one token account pinned at `create_vault`, so on-chain balances can't desync from `deposited`/`disbursed`.                                                       | `constraint = vault_token.key() == vault.token_account` on both `deposit` and `disburse`.                                                       | constraint-enforced (TS integration)                                                                                                                       |

### settlement_job

| ID                      | Invariant                                                                                                                                                                           | Enforcement                                                                                 | Proof / test                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **J1 Conservation**     | On any release, `amount_to_recipient + fee == available` — no funds created or destroyed.                                                                                           | `math::rake`.                                                                               | Kani `rake_conserves_value`; test `rake_conserves_funds` |
| **J2 No fee on refund** | A refund (`take_fee = false`) withholds zero fee and returns the full balance to the client.                                                                                        | `math::rake` early return.                                                                  | Kani `refund_has_no_fee`; test `refund_takes_no_fee`     |
| **J3 Fee bound**        | `fee ≤ available`.                                                                                                                                                                  | `math::rake` (`fee_bps < 10_000` checked at `create_job`).                                  | Kani `rake_conserves_value`                              |
| **J4 State machine**    | Transitions follow `Open→Delivered→Resolved` / `Disputed`; only `provider` delivers, only `client` approves, only `controller` resolves disputes, only `client` refunds while Open. | per-handler `require!` on state + actor.                                                    | constraint-enforced (TS integration)                     |
| **J5 Vault binding**    | A job only operates on its own vault, and that vault is bound to this program.                                                                                                      | `constraint = job.vault == vault.key()`; `require!(vault.settlement_program == crate::ID)`. | constraint-enforced (TS integration)                     |

### settlement_game_poker

| ID                        | Invariant                                                                                                     | Enforcement                                                                               | Proof / test                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **P1 Pot conservation**   | On settle, `payout_to_winner + fee == pot` (the full vault balance).                                          | `math::pot_split`.                                                                        | Kani `pot_split_conserves_value`; test `conserves_pot` |
| **P2 Fee bound**          | `fee ≤ pot`.                                                                                                  | `math::pot_split`.                                                                        | Kani `pot_split_conserves_value`                       |
| **P3 Winner eligibility** | The settled winner must have joined (a `PlayerEntry` exists for them) and the payout token account is theirs. | `require!(winner_entry.game == game.key())`, `winner_token.owner == winner_entry.player`. | constraint-enforced (TS integration)                   |
| **P4 Min players**        | A game can only settle with ≥ 2 players.                                                                      | `require!(game.player_count >= 2)`.                                                       | constraint-enforced (TS integration)                   |
| **P5 Refund integrity**   | Each player can refund exactly their stake once, only after `cancel`.                                         | `require!(!entry.refunded)`, state `Cancelled`, `disburse(entry.amount, 0)`.              | constraint-enforced (TS integration)                   |

## Notes on the funds-conservation chain

End-to-end solvency is the composition of two facts:

1. **Settlement never asks escrow for more than the pot/balance.** J1/J3 and
   P1/P2 prove that the `(amount, fee)` a settlement program passes to
   `escrow::disburse` sums to at most the available balance it read.
2. **Escrow never releases more than it holds.** E1/E2 prove `apply_disburse`
   rejects any `amount + fee` exceeding `deposited − disbursed`, independent of
   what the caller requests.

So even a buggy or malicious settlement program cannot drain a vault beyond its
deposits — escrow is the backstop. E5 additionally ensures _only_ the bound
settlement program can trigger a disburse at all.
