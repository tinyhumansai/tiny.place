use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};
use escrow::cpi::accounts::Disburse;
use escrow::program::Escrow;
use escrow::{Vault, VAULT_AUTHORITY_SEED};

pub mod math;

declare_id!("7vXRCMe8jBcHT3zrgnW5mXLxBpWWKsBpn5XCCCnQpot8");

/// Basis-points denominator: a `fee_bps` of 250 means a 2.50% rake.
pub const BPS_DENOMINATOR: u64 = 10_000;

/// settlement_job is the policy layer for job/task escrow. It owns the job
/// lifecycle (deliver → approve, or dispute → arbitrated resolve), holds a
/// server `controller` key that decides disputes, and reads the bound escrow
/// vault's balance. It never touches funds directly — it CPIs `escrow::disburse`
/// (signing with its `vault_authority` PDA) to release money, and wraps
/// `escrow::deposit` for funding.
#[program]
pub mod settlement_job {
    use super::*;

    /// Register a job against an existing escrow vault. The vault must already
    /// be bound to this program (created via escrow::create_vault with
    /// settlement_program = this program id).
    pub fn create_job(
        ctx: Context<CreateJob>,
        job_id: [u8; 32],
        provider: Pubkey,
        controller: Pubkey,
        fee_bps: u16,
    ) -> Result<()> {
        require!((fee_bps as u64) < BPS_DENOMINATOR, JobError::InvalidFee);
        require!(
            ctx.accounts.vault.settlement_program == crate::ID,
            JobError::VaultNotBound
        );

        let job = &mut ctx.accounts.job;
        job.job_id = job_id;
        job.client = ctx.accounts.client.key();
        job.provider = provider;
        job.controller = controller;
        job.vault = ctx.accounts.vault.key();
        job.fee_bps = fee_bps;
        job.state = JobState::Open;
        job.bump = ctx.bumps.job;

        emit!(JobCreated {
            job: job.key(),
            job_id,
            client: job.client,
            provider,
            vault: job.vault,
        });
        Ok(())
    }

    /// Client funds the job by depositing into the escrow vault (x402), wrapped
    /// via CPI so the job stays the single orchestrator of money-in.
    pub fn fund(ctx: Context<Fund>, payload: escrow::PaymentPayload) -> Result<()> {
        require!(
            ctx.accounts.job.state == JobState::Open,
            JobError::InvalidState
        );
        require!(
            ctx.accounts.client.key() == ctx.accounts.job.client,
            JobError::Unauthorized
        );

        escrow::cpi::deposit(
            CpiContext::new(
                ctx.accounts.escrow_program.key(),
                escrow::cpi::accounts::Deposit {
                    vault: ctx.accounts.vault.to_account_info(),
                    nonce_tracker: ctx.accounts.nonce_tracker.to_account_info(),
                    payer: ctx.accounts.client.to_account_info(),
                    payer_token: ctx.accounts.client_token.to_account_info(),
                    vault_token: ctx.accounts.vault_token.to_account_info(),
                    token_program: ctx.accounts.token_program.to_account_info(),
                },
            ),
            payload,
        )
    }

    /// Provider marks the work delivered.
    pub fn mark_delivered(ctx: Context<UpdateJob>) -> Result<()> {
        let job = &mut ctx.accounts.job;
        require!(job.state == JobState::Open, JobError::InvalidState);
        require!(
            ctx.accounts.actor.key() == job.provider,
            JobError::Unauthorized
        );
        job.state = JobState::Delivered;
        emit!(JobDelivered { job: job.key() });
        Ok(())
    }

    /// Client accepts delivery; funds release to the provider minus the rake.
    pub fn approve(ctx: Context<Settle>) -> Result<()> {
        require!(
            ctx.accounts.job.state == JobState::Delivered,
            JobError::InvalidState
        );
        require!(
            ctx.accounts.actor.key() == ctx.accounts.job.client,
            JobError::Unauthorized
        );
        require!(
            ctx.accounts.recipient_token.owner == ctx.accounts.job.provider,
            JobError::Unauthorized
        );

        release(&ctx, true)?;
        ctx.accounts.job.state = JobState::Resolved;
        emit!(JobResolved {
            job: ctx.accounts.job.key(),
            to: ctx.accounts.recipient_token.key(),
        });
        Ok(())
    }

    /// Either party opens a dispute after delivery; funds stay locked.
    pub fn dispute(ctx: Context<UpdateJob>) -> Result<()> {
        let job = &mut ctx.accounts.job;
        require!(job.state == JobState::Delivered, JobError::InvalidState);
        let actor = ctx.accounts.actor.key();
        require!(
            actor == job.client || actor == job.provider,
            JobError::Unauthorized
        );
        job.state = JobState::Disputed;
        emit!(JobDisputed { job: job.key(), by: actor });
        Ok(())
    }

    /// Server controller resolves a dispute. `award_provider` true releases to
    /// the provider (minus rake); false refunds the client (no rake).
    pub fn resolve(ctx: Context<Settle>, award_provider: bool) -> Result<()> {
        require!(
            ctx.accounts.job.state == JobState::Disputed,
            JobError::InvalidState
        );
        require!(
            ctx.accounts.actor.key() == ctx.accounts.job.controller,
            JobError::Unauthorized
        );
        let expected = if award_provider {
            ctx.accounts.job.provider
        } else {
            ctx.accounts.job.client
        };
        require!(
            ctx.accounts.recipient_token.owner == expected,
            JobError::Unauthorized
        );

        release(&ctx, award_provider)?;
        ctx.accounts.job.state = JobState::Resolved;
        emit!(JobResolved {
            job: ctx.accounts.job.key(),
            to: ctx.accounts.recipient_token.key(),
        });
        Ok(())
    }

    /// Client reclaims funds while the job is still Open (no rake on refunds).
    pub fn refund(ctx: Context<Settle>) -> Result<()> {
        require!(
            ctx.accounts.job.state == JobState::Open,
            JobError::InvalidState
        );
        require!(
            ctx.accounts.actor.key() == ctx.accounts.job.client,
            JobError::Unauthorized
        );
        require!(
            ctx.accounts.recipient_token.owner == ctx.accounts.job.client,
            JobError::Unauthorized
        );

        release(&ctx, false)?;
        ctx.accounts.job.state = JobState::Refunded;
        emit!(JobRefunded { job: ctx.accounts.job.key() });
        Ok(())
    }
}

/// Disburse the vault's available balance to `recipient_token`. When `take_fee`
/// is set, the rake (job.fee_bps) is split off to the vault fee account.
fn release(ctx: &Context<Settle>, take_fee: bool) -> Result<()> {
    let available = ctx
        .accounts
        .vault
        .deposited
        .checked_sub(ctx.accounts.vault.disbursed)
        .ok_or(JobError::MathOverflow)?;

    let (amount, fee) = math::rake(available, ctx.accounts.job.fee_bps, take_fee)
        .ok_or(JobError::MathOverflow)?;

    let bump = ctx.bumps.vault_authority;
    let seeds: &[&[u8]] = &[VAULT_AUTHORITY_SEED, &[bump]];
    let signer_seeds = &[seeds];

    escrow::cpi::disburse(
        CpiContext::new_with_signer(
            ctx.accounts.escrow_program.key(),
            Disburse {
                vault: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
                vault_token: ctx.accounts.vault_token.to_account_info(),
                recipient_token: ctx.accounts.recipient_token.to_account_info(),
                fee_token: ctx.accounts.fee_token.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
        fee,
    )
}

// --- State ---

/// Job lifecycle:
///
/// ```text
///                 mark_delivered            approve
///   Open ───────────────────────► Delivered ─────────► Resolved (→ provider)
///    │                               │
///    │ refund (→ client)             │ dispute
///    ▼                               ▼
///  Refunded                       Disputed ── resolve(award) ──► Resolved
/// ```
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum JobState {
    /// Created and (optionally) funded; awaiting delivery, or refundable.
    Open,
    /// Provider has delivered; awaiting client acceptance or a dispute.
    Delivered,
    /// A party disputed after delivery; funds locked until the controller rules.
    Disputed,
    /// Terminal: funds released to the awarded party.
    Resolved,
    /// Terminal: funds returned to the client (refunded while Open).
    Refunded,
}

/// On-chain record of a job. Holds the parties, the rake, and a pointer to the
/// escrow vault that custodies the funds. PDA: `["job", job_id]`.
#[account]
pub struct Job {
    /// Caller-supplied 32-byte id; also the PDA seed.
    pub job_id: [u8; 32],
    /// The client who funds the job and accepts/disputes delivery.
    pub client: Pubkey,
    /// The provider who delivers the work and is paid on approval.
    pub provider: Pubkey,
    /// Server key authorized to resolve disputes (win/lose rulings).
    pub controller: Pubkey,
    /// The escrow vault holding this job's funds.
    pub vault: Pubkey,
    /// Platform rake in basis points, applied on releases to the provider.
    pub fee_bps: u16,
    /// Lifecycle state.
    pub state: JobState,
    /// Cached PDA bump for `["job", job_id]`.
    pub bump: u8,
}

impl Job {
    /// 8 discriminator + job_id(32) + 4×Pubkey(128) + fee_bps(2) + state(1) +
    /// bump(1).
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 32 + 32 + 2 + 1 + 1;
}

// --- Contexts ---

/// Accounts for [`settlement_job::create_job`]. The vault must already exist and
/// be bound to this program.
#[derive(Accounts)]
#[instruction(job_id: [u8; 32])]
pub struct CreateJob<'info> {
    /// The job record being created; PDA `["job", job_id]`.
    #[account(
        init,
        payer = client,
        space = Job::SIZE,
        seeds = [b"job", job_id.as_ref()],
        bump
    )]
    pub job: Account<'info, Job>,
    /// The client; pays rent and is recorded as `job.client`.
    #[account(mut)]
    pub client: Signer<'info>,
    /// The escrow vault that will custody funds; checked to be bound to this
    /// program (`vault.settlement_program == crate::ID`).
    pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}

/// Accounts for [`settlement_job::fund`]. A thin wrapper that CPIs
/// `escrow::deposit`; the remaining accounts are forwarded to escrow.
#[derive(Accounts)]
pub struct Fund<'info> {
    /// The job being funded; must point at `vault`.
    #[account(constraint = job.vault == vault.key() @ JobError::VaultMismatch)]
    pub job: Account<'info, Job>,
    /// The escrow vault (mutated by the CPI deposit).
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    /// CHECK: escrow nonce tracker PDA for the client; validated inside
    /// `escrow::deposit`.
    #[account(mut)]
    pub nonce_tracker: UncheckedAccount<'info>,
    /// The client funding the job; the deposit's payer.
    #[account(mut)]
    pub client: Signer<'info>,
    /// Client's source token account.
    #[account(mut)]
    pub client_token: Account<'info, TokenAccount>,
    /// The vault's pinned token account (deposit destination).
    #[account(mut)]
    pub vault_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    /// The escrow program, invoked via CPI.
    pub escrow_program: Program<'info, Escrow>,
}

/// Accounts for the no-fund state transitions ([`mark_delivered`], [`dispute`]).
#[derive(Accounts)]
pub struct UpdateJob<'info> {
    #[account(mut)]
    pub job: Account<'info, Job>,
    /// The caller; its authorization is checked per-instruction.
    pub actor: Signer<'info>,
}

/// Accounts for the fund-releasing instructions ([`approve`], [`resolve`],
/// [`refund`]). Carries everything needed to CPI `escrow::disburse`.
#[derive(Accounts)]
pub struct Settle<'info> {
    /// The job being settled; must point at `vault`.
    #[account(mut, constraint = job.vault == vault.key() @ JobError::VaultMismatch)]
    pub job: Account<'info, Job>,
    /// The caller (client / controller depending on the instruction).
    pub actor: Signer<'info>,
    /// The escrow vault being drained.
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    /// CHECK: this program's `vault_authority` PDA; signs the escrow disburse
    /// CPI via its seeds, and equals the vault's stored authority.
    #[account(seeds = [VAULT_AUTHORITY_SEED], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    /// The vault's pinned token account (disburse source).
    #[account(mut)]
    pub vault_token: Account<'info, TokenAccount>,
    /// Where funds go — provider on approve, provider or client on resolve,
    /// client on refund (owner is verified per-instruction).
    #[account(mut)]
    pub recipient_token: Account<'info, TokenAccount>,
    /// Fee destination; escrow verifies it equals `vault.fee_account`.
    #[account(mut)]
    pub fee_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    /// The escrow program, invoked via CPI.
    pub escrow_program: Program<'info, Escrow>,
}

// --- Events ---

/// Emitted when a job is registered against a vault.
#[event]
pub struct JobCreated {
    pub job: Pubkey,
    pub job_id: [u8; 32],
    pub client: Pubkey,
    pub provider: Pubkey,
    pub vault: Pubkey,
}

/// Emitted when the provider marks the work delivered.
#[event]
pub struct JobDelivered {
    pub job: Pubkey,
}

/// Emitted when a party opens a dispute; `by` is the disputing party.
#[event]
pub struct JobDisputed {
    pub job: Pubkey,
    pub by: Pubkey,
}

/// Emitted when funds are released (approve or dispute resolution); `to` is the
/// recipient token account.
#[event]
pub struct JobResolved {
    pub job: Pubkey,
    pub to: Pubkey,
}

/// Emitted when the client refunds an Open job.
#[event]
pub struct JobRefunded {
    pub job: Pubkey,
}

// --- Errors ---

#[error_code]
pub enum JobError {
    #[msg("Invalid job state for this operation")]
    InvalidState,
    #[msg("Unauthorized caller")]
    Unauthorized,
    #[msg("Fee basis points must be below 10000")]
    InvalidFee,
    #[msg("Vault is not bound to this settlement program")]
    VaultNotBound,
    #[msg("Vault does not match the job")]
    VaultMismatch,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
