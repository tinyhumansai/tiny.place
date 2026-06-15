use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};
use escrow::cpi::accounts::Disburse;
use escrow::program::Escrow;
use escrow::{Vault, VAULT_AUTHORITY_SEED};

pub mod math;

declare_id!("MfwLo55Nkv3SCQ2uFuoWXmAe7zJR6t3rMdm9K8Lr5Me");

// On-chain security contact (read by explorers like Solscan).
#[cfg(not(feature = "no-entrypoint"))]
solana_security_txt::security_txt! {
    name: "tiny.place settlement_game_lottery",
    project_url: "https://tiny.place",
    contacts: "email:security@tinyhumans.ai",
    policy: "https://github.com/tinyhumansai/tiny.place/blob/main/SECURITY.md",
    source_code: "https://github.com/tinyhumansai/tiny.place",
    preferred_languages: "en"
}

/// Basis-points denominator: a `fee_bps` of 500 means a 5.00% rake.
pub const BPS_DENOMINATOR: u64 = 10_000;

/// settlement_game_lottery is the policy layer for the 24h pooled-pot lottery.
/// All game *logic* — the commit-reveal draw, the ticket-weighted winner
/// selection, and the geometric payout curve — runs off-chain on the backend;
/// this program only custodies funds (through the bound `escrow` vault) and
/// settles. Agents buy tickets by depositing USDC via x402 `buy` (1 USDC = 1
/// ticket), a designated server `drawer` declares the winners and their exact
/// payout amounts, and each payout is released through `escrow::disburse`. The
/// chain enforces only solvency, drawer authorization, and round state; the
/// drawer is authoritative for *who wins and how much*, exactly like poker's
/// trusted `settler`. Funds always live in escrow custody.
#[program]
pub mod settlement_game_lottery {
    use super::*;

    /// Register a lottery round against an escrow vault already bound to this
    /// program. The vault is bound 1:1 to this round's PDA (escrow records
    /// `vault.owner` = this round's key), so a third party cannot register a
    /// competing round over an already-funded pot vault to drain it.
    pub fn create_round(
        ctx: Context<CreateRound>,
        round_id: [u8; 32],
        drawer: Pubkey,
        ticket_price: u64,
        fee_bps: u16,
    ) -> Result<()> {
        require!(ticket_price > 0, LotteryError::InvalidAmount);
        require!((fee_bps as u64) < BPS_DENOMINATOR, LotteryError::InvalidFee);
        require!(
            ctx.accounts.vault.settlement_program == crate::ID,
            LotteryError::VaultNotBound
        );
        require!(
            ctx.accounts.vault.owner == ctx.accounts.round.key(),
            LotteryError::VaultNotOwned
        );

        let round = &mut ctx.accounts.round;
        round.round_id = round_id;
        round.drawer = drawer;
        round.vault = ctx.accounts.vault.key();
        round.ticket_price = ticket_price;
        round.fee_bps = fee_bps;
        round.ticket_count = 0;
        round.participant_count = 0;
        round.paid_out = 0;
        round.state = RoundState::Open;
        round.bump = ctx.bumps.round;

        emit!(RoundCreated {
            round: round.key(),
            round_id,
            drawer,
            vault: round.vault,
            ticket_price,
        });
        Ok(())
    }

    /// x402 ticket purchase: deposit USDC into the escrow vault (wrapped via CPI)
    /// and mint `amount / ticket_price` tickets into the buyer's entry. Repeat
    /// buys by the same agent accumulate into one entry. `amount` must be a
    /// non-zero whole multiple of the ticket price.
    pub fn buy(ctx: Context<Buy>, payload: escrow::PaymentPayload) -> Result<()> {
        let tickets = {
            let round = &ctx.accounts.round;
            require!(round.state == RoundState::Open, LotteryError::InvalidState);
            require!(
                payload.payer == ctx.accounts.player.key(),
                LotteryError::Unauthorized
            );
            require!(payload.amount > 0, LotteryError::InvalidAmount);
            // Whole-ticket multiples only; partial tickets are rejected.
            math::tickets_for(payload.amount, round.ticket_price)
                .ok_or(LotteryError::InvalidAmount)?
        };

        escrow::cpi::deposit(
            CpiContext::new(
                ctx.accounts.escrow_program.key(),
                escrow::cpi::accounts::Deposit {
                    vault: ctx.accounts.vault.to_account_info(),
                    nonce_tracker: ctx.accounts.nonce_tracker.to_account_info(),
                    payer: ctx.accounts.player.to_account_info(),
                    payer_token: ctx.accounts.player_token.to_account_info(),
                    vault_token: ctx.accounts.vault_token.to_account_info(),
                    token_program: ctx.accounts.token_program.to_account_info(),
                },
            ),
            payload.clone(),
        )?;

        let round_key = ctx.accounts.round.key();
        let entry = &mut ctx.accounts.ticket_entry;
        let first_buy = entry.buyer == Pubkey::default();
        if first_buy {
            entry.round = round_key;
            entry.buyer = ctx.accounts.player.key();
            entry.refunded = false;
            entry.bump = ctx.bumps.ticket_entry;
        }
        entry.amount = entry
            .amount
            .checked_add(payload.amount)
            .ok_or(LotteryError::MathOverflow)?;
        entry.tickets = entry
            .tickets
            .checked_add(tickets)
            .ok_or(LotteryError::MathOverflow)?;

        let round = &mut ctx.accounts.round;
        round.ticket_count = round
            .ticket_count
            .checked_add(tickets)
            .ok_or(LotteryError::MathOverflow)?;
        if first_buy {
            round.participant_count = round
                .participant_count
                .checked_add(1)
                .ok_or(LotteryError::MathOverflow)?;
        }

        emit!(TicketsBought {
            round: round.key(),
            buyer: entry.buyer,
            tickets,
            amount: payload.amount,
            ticket_count: round.ticket_count,
        });
        Ok(())
    }

    /// Drawer locks the round at cutoff: no more deposits, ready to pay winners.
    pub fn begin_draw(ctx: Context<DrawerOnly>) -> Result<()> {
        let round = &mut ctx.accounts.round;
        require!(round.state == RoundState::Open, LotteryError::InvalidState);
        require!(
            ctx.accounts.drawer.key() == round.drawer,
            LotteryError::Unauthorized
        );
        round.state = RoundState::Drawing;
        emit!(DrawStarted { round: round.key() });
        Ok(())
    }

    /// Drawer pays one winner. Called once per winner while the round is
    /// `Drawing`; the rake is taken as `fee` on the first call (`fee = 0`
    /// thereafter). `amount` and `fee` are computed off-chain (geometric curve);
    /// escrow's solvency check bounds the cumulative payout to the pot.
    pub fn settle_winner(ctx: Context<SettleWinner>, amount: u64, fee: u64) -> Result<()> {
        require!(
            ctx.accounts.round.state == RoundState::Drawing,
            LotteryError::InvalidState
        );
        require!(
            ctx.accounts.drawer.key() == ctx.accounts.round.drawer,
            LotteryError::Unauthorized
        );

        disburse_signed(
            &ctx.accounts.escrow_program,
            &ctx.accounts.vault,
            &ctx.accounts.vault_authority,
            &ctx.accounts.vault_token,
            &ctx.accounts.winner_token,
            &ctx.accounts.fee_token,
            &ctx.accounts.token_program,
            ctx.bumps.vault_authority,
            amount,
            fee,
        )?;

        let round = &mut ctx.accounts.round;
        round.paid_out = round
            .paid_out
            .checked_add(amount)
            .and_then(|v| v.checked_add(fee))
            .ok_or(LotteryError::MathOverflow)?;
        emit!(WinnerPaid {
            round: round.key(),
            winner: ctx.accounts.winner_token.owner,
            amount,
            fee,
        });
        Ok(())
    }

    /// Drawer marks the round fully paid out.
    pub fn finalize(ctx: Context<DrawerOnly>) -> Result<()> {
        let round = &mut ctx.accounts.round;
        require!(round.state == RoundState::Drawing, LotteryError::InvalidState);
        require!(
            ctx.accounts.drawer.key() == round.drawer,
            LotteryError::Unauthorized
        );
        round.state = RoundState::Settled;
        emit!(RoundSettled {
            round: round.key(),
            paid_out: round.paid_out,
        });
        Ok(())
    }

    /// Drawer aborts a round (e.g. too few participants at cutoff); depositors
    /// reclaim their stakes via `claim_refund`.
    pub fn cancel(ctx: Context<DrawerOnly>) -> Result<()> {
        let round = &mut ctx.accounts.round;
        require!(
            round.state == RoundState::Open || round.state == RoundState::Drawing,
            LotteryError::InvalidState
        );
        require!(
            ctx.accounts.drawer.key() == round.drawer,
            LotteryError::Unauthorized
        );
        round.state = RoundState::Cancelled;
        emit!(RoundCancelled { round: round.key() });
        Ok(())
    }

    /// A depositor reclaims their USDC from a cancelled round. Refunds always go
    /// to the on-chain ticket entry's depositor.
    pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
        require!(
            ctx.accounts.round.state == RoundState::Cancelled,
            LotteryError::InvalidState
        );
        require!(
            !ctx.accounts.ticket_entry.refunded,
            LotteryError::AlreadyRefunded
        );
        require!(
            ctx.accounts.buyer_token.owner == ctx.accounts.ticket_entry.buyer,
            LotteryError::Unauthorized
        );

        let amount = ctx.accounts.ticket_entry.amount;
        disburse_signed(
            &ctx.accounts.escrow_program,
            &ctx.accounts.vault,
            &ctx.accounts.vault_authority,
            &ctx.accounts.vault_token,
            &ctx.accounts.buyer_token,
            &ctx.accounts.fee_token,
            &ctx.accounts.token_program,
            ctx.bumps.vault_authority,
            amount,
            0,
        )?;

        let entry = &mut ctx.accounts.ticket_entry;
        entry.refunded = true;
        emit!(TicketsRefunded {
            round: ctx.accounts.round.key(),
            buyer: entry.buyer,
            amount,
        });
        Ok(())
    }
}

/// CPI into escrow::disburse, signing with this program's vault_authority PDA.
#[allow(clippy::too_many_arguments)]
fn disburse_signed<'info>(
    escrow_program: &Program<'info, Escrow>,
    vault: &Account<'info, Vault>,
    vault_authority: &UncheckedAccount<'info>,
    vault_token: &Account<'info, TokenAccount>,
    recipient_token: &Account<'info, TokenAccount>,
    fee_token: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    authority_bump: u8,
    amount: u64,
    fee: u64,
) -> Result<()> {
    let seeds: &[&[u8]] = &[VAULT_AUTHORITY_SEED, &[authority_bump]];
    let signer_seeds = &[seeds];
    escrow::cpi::disburse(
        CpiContext::new_with_signer(
            escrow_program.key(),
            Disburse {
                vault: vault.to_account_info(),
                authority: vault_authority.to_account_info(),
                vault_token: vault_token.to_account_info(),
                recipient_token: recipient_token.to_account_info(),
                fee_token: fee_token.to_account_info(),
                token_program: token_program.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
        fee,
    )
}

// --- State ---

/// Round lifecycle:
///
/// ```text
///              buy × N            begin_draw      settle_winner × N    finalize
///   Open ───────────────────────────────────► Drawing ───────────────────────► Settled
///    │
///    │ cancel (drawer)                                  cancel (drawer)
///    ▼                                                       │
///  Cancelled ◄───────────────────────────────────────────────┘
///    └── claim_refund × N ──► (each depositor reclaims their stake)
/// ```
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum RoundState {
    /// Accepting ticket purchases.
    Open,
    /// Locked at cutoff; the drawer is paying winners.
    Drawing,
    /// Terminal: all winners paid.
    Settled,
    /// Terminal-ish: aborted; depositors reclaim stakes via `claim_refund`.
    Cancelled,
}

/// On-chain record of a 24h pooled-pot lottery round. Funds live in the bound
/// escrow vault; this account tracks tickets, participants, and rake.
/// PDA: `["round", round_id]`.
#[account]
pub struct Round {
    /// Caller-supplied 32-byte id; also the PDA seed.
    pub round_id: [u8; 32],
    /// Server key authorized to draw, settle, and cancel.
    pub drawer: Pubkey,
    /// The escrow vault holding the pot.
    pub vault: Pubkey,
    /// USDC base units per ticket (1 USDC = 1 ticket ⇒ 1_000_000).
    pub ticket_price: u64,
    /// Platform rake in basis points, taken from the pot at settlement.
    pub fee_bps: u16,
    /// Total tickets sold this round.
    pub ticket_count: u64,
    /// Distinct participants (buyers) this round.
    pub participant_count: u32,
    /// Running total disbursed (payouts + rake) during settlement.
    pub paid_out: u64,
    /// Lifecycle state.
    pub state: RoundState,
    /// Cached PDA bump for `["round", round_id]`.
    pub bump: u8,
}

impl Round {
    /// 8 discriminator + round_id(32) + drawer(32) + vault(32) + ticket_price(8)
    /// + fee_bps(2) + ticket_count(8) + participant_count(4) + paid_out(8) +
    /// state(1) + bump(1).
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 8 + 2 + 8 + 4 + 8 + 1 + 1;
}

/// A buyer's stake in a round; the unit of refund on cancel. One per
/// (round, buyer), accumulating across repeat buys. PDA:
/// `["ticket", round, buyer]`. It records the depositor and total USDC for
/// refund safety.
#[account]
pub struct TicketEntry {
    /// The round this entry belongs to.
    pub round: Pubkey,
    /// The depositor who bought the tickets.
    pub buyer: Pubkey,
    /// Total USDC base units deposited by this buyer.
    pub amount: u64,
    /// Total tickets minted to this buyer.
    pub tickets: u64,
    /// Whether this stake has already been refunded (cancel path).
    pub refunded: bool,
    /// Cached PDA bump.
    pub bump: u8,
}

impl TicketEntry {
    /// 8 discriminator + round(32) + buyer(32) + amount(8) + tickets(8) +
    /// refunded(1) + bump(1).
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 8 + 1 + 1;
}

// --- Contexts ---

/// Accounts for [`settlement_game_lottery::create_round`].
#[derive(Accounts)]
#[instruction(round_id: [u8; 32])]
pub struct CreateRound<'info> {
    /// The round record being created; PDA `["round", round_id]`.
    #[account(
        init,
        payer = creator,
        space = Round::SIZE,
        seeds = [b"round", round_id.as_ref()],
        bump
    )]
    pub round: Account<'info, Round>,
    /// Pays rent for the round account (the backend).
    #[account(mut)]
    pub creator: Signer<'info>,
    /// The escrow vault that custodies the pot; checked to be bound + owned.
    pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}

/// Accounts for [`settlement_game_lottery::buy`]. Creates or accumulates the
/// buyer's entry and CPIs `escrow::deposit` for the USDC.
#[derive(Accounts)]
#[instruction(payload: escrow::PaymentPayload)]
pub struct Buy<'info> {
    /// The round being bought into; must point at `vault`.
    #[account(mut, constraint = round.vault == vault.key() @ LotteryError::VaultMismatch)]
    pub round: Account<'info, Round>,
    /// The buyer's accumulating entry; PDA `["ticket", round, buyer]`.
    #[account(
        init_if_needed,
        payer = player,
        space = TicketEntry::SIZE,
        seeds = [b"ticket", round.key().as_ref(), player.key().as_ref()],
        bump
    )]
    pub ticket_entry: Account<'info, TicketEntry>,
    /// The escrow vault (mutated by the CPI deposit).
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    /// CHECK: escrow nonce tracker PDA for the player; validated inside
    /// `escrow::deposit`.
    #[account(mut)]
    pub nonce_tracker: UncheckedAccount<'info>,
    /// The buying agent; the deposit's payer.
    #[account(mut)]
    pub player: Signer<'info>,
    /// Player's source token account.
    #[account(mut)]
    pub player_token: Account<'info, TokenAccount>,
    /// The vault's pinned token account (deposit destination).
    #[account(mut)]
    pub vault_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    /// The escrow program, invoked via CPI.
    pub escrow_program: Program<'info, Escrow>,
    pub system_program: Program<'info, System>,
}

/// Accounts for drawer-only state transitions (`begin_draw`, `finalize`,
/// `cancel`).
#[derive(Accounts)]
pub struct DrawerOnly<'info> {
    #[account(mut)]
    pub round: Account<'info, Round>,
    /// Must equal `round.drawer`.
    pub drawer: Signer<'info>,
}

/// Accounts for [`settlement_game_lottery::settle_winner`]. Releases one
/// winner's payout (and, on the first call, the rake) via `escrow::disburse`.
#[derive(Accounts)]
pub struct SettleWinner<'info> {
    /// The round being settled; must point at `vault`.
    #[account(mut, constraint = round.vault == vault.key() @ LotteryError::VaultMismatch)]
    pub round: Account<'info, Round>,
    /// Must equal `round.drawer`.
    pub drawer: Signer<'info>,
    /// The escrow vault being drained.
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    /// CHECK: this program's `vault_authority` PDA; signs the escrow CPI.
    #[account(seeds = [VAULT_AUTHORITY_SEED], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    /// The vault's pinned token account (disburse source).
    #[account(mut)]
    pub vault_token: Account<'info, TokenAccount>,
    /// The winner's token account (the server maps winner ⇒ wallet off-chain).
    #[account(mut)]
    pub winner_token: Account<'info, TokenAccount>,
    /// Fee destination; escrow verifies it equals `vault.fee_account`. Must
    /// differ from `winner_token` (Anchor forbids duplicate mutable accounts).
    #[account(mut)]
    pub fee_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    /// The escrow program, invoked via CPI.
    pub escrow_program: Program<'info, Escrow>,
}

/// Accounts for [`settlement_game_lottery::claim_refund`]. A depositor reclaims
/// their stake from a cancelled round via `escrow::disburse`.
#[derive(Accounts)]
pub struct ClaimRefund<'info> {
    /// The cancelled round; must point at `vault`.
    #[account(constraint = round.vault == vault.key() @ LotteryError::VaultMismatch)]
    pub round: Account<'info, Round>,
    /// The caller's entry; marked refunded after payout.
    #[account(
        mut,
        seeds = [b"ticket", round.key().as_ref(), buyer.key().as_ref()],
        bump = ticket_entry.bump,
    )]
    pub ticket_entry: Account<'info, TicketEntry>,
    /// The depositor reclaiming their stake.
    pub buyer: Signer<'info>,
    /// The escrow vault being drained.
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    /// CHECK: this program's `vault_authority` PDA; signs the escrow CPI.
    #[account(seeds = [VAULT_AUTHORITY_SEED], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    /// The vault's pinned token account (disburse source).
    #[account(mut)]
    pub vault_token: Account<'info, TokenAccount>,
    /// The depositor's token account; must be owned by `ticket_entry.buyer`.
    #[account(mut)]
    pub buyer_token: Account<'info, TokenAccount>,
    /// The vault's fee account — required by `escrow::disburse` even though a
    /// refund withholds zero fee. Must differ from `buyer_token`.
    #[account(mut)]
    pub fee_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    /// The escrow program, invoked via CPI.
    pub escrow_program: Program<'info, Escrow>,
}

// --- Events ---

/// Emitted when a round is created and bound to a vault.
#[event]
pub struct RoundCreated {
    pub round: Pubkey,
    pub round_id: [u8; 32],
    pub drawer: Pubkey,
    pub vault: Pubkey,
    pub ticket_price: u64,
}

/// Emitted on each ticket purchase; carries the running `ticket_count`.
#[event]
pub struct TicketsBought {
    pub round: Pubkey,
    pub buyer: Pubkey,
    pub tickets: u64,
    pub amount: u64,
    pub ticket_count: u64,
}

/// Emitted when the drawer locks the round at cutoff.
#[event]
pub struct DrawStarted {
    pub round: Pubkey,
}

/// Emitted on each winner payout.
#[event]
pub struct WinnerPaid {
    pub round: Pubkey,
    pub winner: Pubkey,
    pub amount: u64,
    pub fee: u64,
}

/// Emitted when the drawer finalizes a fully-paid round.
#[event]
pub struct RoundSettled {
    pub round: Pubkey,
    pub paid_out: u64,
}

/// Emitted when the drawer cancels a round.
#[event]
pub struct RoundCancelled {
    pub round: Pubkey,
}

/// Emitted when a depositor reclaims their stake from a cancelled round.
#[event]
pub struct TicketsRefunded {
    pub round: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
}

// --- Errors ---

#[error_code]
pub enum LotteryError {
    #[msg("Invalid round state for this operation")]
    InvalidState,
    #[msg("Unauthorized caller")]
    Unauthorized,
    #[msg("Deposit must be a non-zero whole multiple of the ticket price")]
    InvalidAmount,
    #[msg("Fee basis points must be below 10000")]
    InvalidFee,
    #[msg("Vault is not bound to this settlement program")]
    VaultNotBound,
    #[msg("Vault is not owned by this round (claimed by another job/game)")]
    VaultNotOwned,
    #[msg("Vault does not match the round")]
    VaultMismatch,
    #[msg("Stake already refunded")]
    AlreadyRefunded,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
