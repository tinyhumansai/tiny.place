use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

pub mod math;

declare_id!("Akw97oRg5g6uMnQqkpJ6qHMpxsZCJSixZyQ1Uuitd32D");

#[cfg(not(feature = "no-entrypoint"))]
solana_security_txt::security_txt! {
    name: "tiny.place job_escrow",
    project_url: "https://tiny.place",
    contacts: "email:security@tinyhumans.ai",
    policy: "https://github.com/tinyhumansai/tiny.place/blob/main/SECURITY.md",
    source_code: "https://github.com/tinyhumansai/tiny.place",
    preferred_languages: "en"
}

#[program]
pub mod job_escrow {
    use super::*;

    pub fn create_job(
        ctx: Context<CreateJob>,
        job_id: [u8; 32],
        provider: Pubkey,
        controller: Pubkey,
        fee_bps: u16,
    ) -> Result<()> {
        require!(
            (fee_bps as u64) < math::BPS_DENOMINATOR,
            JobEscrowError::InvalidFee
        );

        let job = &mut ctx.accounts.job;
        job.job_id = job_id;
        job.client = ctx.accounts.client.key();
        job.provider = provider;
        job.controller = controller;
        job.mint = ctx.accounts.mint.key();
        job.vault_token = ctx.accounts.vault_token.key();
        job.fee_account = ctx.accounts.fee_account.key();
        job.deposited = 0;
        job.disbursed = 0;
        job.fee_bps = fee_bps;
        job.state = JobState::Open;
        job.kind = EscrowKind::Job;
        job.bump = ctx.bumps.job;

        emit!(JobCreated {
            job: job.key(),
            job_id,
            client: job.client,
            provider,
            mint: job.mint,
            vault_token: job.vault_token,
        });
        Ok(())
    }

    /// Create a bounty: the same custody model as a job, but with no provider
    /// baked in. The sponsor is the `client`; the winner is chosen by the
    /// controller at `award_bounty` time. Funded via the same `fund`/`fund_for`.
    pub fn create_bounty(
        ctx: Context<CreateJob>,
        job_id: [u8; 32],
        controller: Pubkey,
        fee_bps: u16,
    ) -> Result<()> {
        require!(
            (fee_bps as u64) < math::BPS_DENOMINATOR,
            JobEscrowError::InvalidFee
        );

        let job = &mut ctx.accounts.job;
        job.job_id = job_id;
        job.client = ctx.accounts.client.key();
        // No provider is known up front; the controller picks the winner later.
        job.provider = Pubkey::default();
        job.controller = controller;
        job.mint = ctx.accounts.mint.key();
        job.vault_token = ctx.accounts.vault_token.key();
        job.fee_account = ctx.accounts.fee_account.key();
        job.deposited = 0;
        job.disbursed = 0;
        job.fee_bps = fee_bps;
        job.state = JobState::Open;
        job.kind = EscrowKind::Bounty;
        job.bump = ctx.bumps.job;

        emit!(BountyCreated {
            job: job.key(),
            job_id,
            sponsor: job.client,
            controller,
            mint: job.mint,
            vault_token: job.vault_token,
        });
        Ok(())
    }

    pub fn init_nonce(ctx: Context<InitNonce>) -> Result<()> {
        let tracker = &mut ctx.accounts.nonce_tracker;
        tracker.owner = ctx.accounts.owner.key();
        tracker.last_nonce = 0;
        tracker.bump = ctx.bumps.nonce_tracker;
        Ok(())
    }

    pub fn fund(ctx: Context<Fund>, payload: PaymentPayload) -> Result<()> {
        require!(
            ctx.accounts.job.state == JobState::Open,
            JobEscrowError::InvalidState
        );
        require!(
            ctx.accounts.client.key() == ctx.accounts.job.client,
            JobEscrowError::Unauthorized
        );
        require!(
            payload.payer == ctx.accounts.client.key(),
            JobEscrowError::Unauthorized
        );
        deposit(
            &mut ctx.accounts.job,
            &mut ctx.accounts.nonce_tracker,
            payload,
        )?;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.client_token.to_account_info(),
                    to: ctx.accounts.vault_token.to_account_info(),
                    authority: ctx.accounts.client.to_account_info(),
                },
            ),
            payload.amount,
        )?;

        emit!(Deposited {
            job: ctx.accounts.job.key(),
            payer: payload.payer,
            amount: payload.amount,
            nonce: payload.nonce,
            deposited: ctx.accounts.job.deposited,
        });
        Ok(())
    }

    pub fn fund_for(ctx: Context<FundFor>, payload: PaymentPayload) -> Result<()> {
        require!(
            ctx.accounts.job.state == JobState::Open,
            JobEscrowError::InvalidState
        );
        require!(
            payload.payer == ctx.accounts.job.client,
            JobEscrowError::Unauthorized
        );
        deposit(
            &mut ctx.accounts.job,
            &mut ctx.accounts.nonce_tracker,
            payload,
        )?;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.client_token.to_account_info(),
                    to: ctx.accounts.vault_token.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            payload.amount,
        )?;

        emit!(Deposited {
            job: ctx.accounts.job.key(),
            payer: payload.payer,
            amount: payload.amount,
            nonce: payload.nonce,
            deposited: ctx.accounts.job.deposited,
        });
        Ok(())
    }

    pub fn mark_delivered(ctx: Context<UpdateJob>) -> Result<()> {
        let job = &mut ctx.accounts.job;
        require!(job.kind == EscrowKind::Job, JobEscrowError::InvalidKind);
        require!(job.state == JobState::Open, JobEscrowError::InvalidState);
        require!(
            ctx.accounts.actor.key() == job.provider,
            JobEscrowError::Unauthorized
        );
        job.state = JobState::Delivered;
        emit!(JobDelivered { job: job.key() });
        Ok(())
    }

    pub fn approve(ctx: Context<Settle>) -> Result<()> {
        require!(
            ctx.accounts.job.kind == EscrowKind::Job,
            JobEscrowError::InvalidKind
        );
        require!(
            ctx.accounts.job.state == JobState::Delivered,
            JobEscrowError::InvalidState
        );
        require!(
            ctx.accounts.actor.key() == ctx.accounts.job.client,
            JobEscrowError::Unauthorized
        );
        require!(
            ctx.accounts.recipient_token.owner == ctx.accounts.job.provider,
            JobEscrowError::Unauthorized
        );
        release(
            &mut ctx.accounts.job,
            &ctx.accounts.vault_token,
            &ctx.accounts.recipient_token,
            &ctx.accounts.fee_token,
            &ctx.accounts.token_program,
            true,
        )?;
        ctx.accounts.job.state = JobState::Resolved;
        emit!(JobResolved {
            job: ctx.accounts.job.key(),
            to: ctx.accounts.recipient_token.key(),
        });
        Ok(())
    }

    pub fn dispute(ctx: Context<UpdateJob>) -> Result<()> {
        let job = &mut ctx.accounts.job;
        require!(job.kind == EscrowKind::Job, JobEscrowError::InvalidKind);
        require!(
            job.state == JobState::Delivered,
            JobEscrowError::InvalidState
        );
        let actor = ctx.accounts.actor.key();
        require!(
            actor == job.client || actor == job.provider,
            JobEscrowError::Unauthorized
        );
        job.state = JobState::Disputed;
        emit!(JobDisputed {
            job: job.key(),
            by: actor
        });
        Ok(())
    }

    pub fn resolve(ctx: Context<Settle>, award_provider: bool) -> Result<()> {
        require!(
            ctx.accounts.job.kind == EscrowKind::Job,
            JobEscrowError::InvalidKind
        );
        require!(
            ctx.accounts.job.state == JobState::Disputed,
            JobEscrowError::InvalidState
        );
        require!(
            ctx.accounts.actor.key() == ctx.accounts.job.controller,
            JobEscrowError::Unauthorized
        );
        let expected = if award_provider {
            ctx.accounts.job.provider
        } else {
            ctx.accounts.job.client
        };
        require!(
            ctx.accounts.recipient_token.owner == expected,
            JobEscrowError::Unauthorized
        );
        release(
            &mut ctx.accounts.job,
            &ctx.accounts.vault_token,
            &ctx.accounts.recipient_token,
            &ctx.accounts.fee_token,
            &ctx.accounts.token_program,
            award_provider,
        )?;
        ctx.accounts.job.state = JobState::Resolved;
        emit!(JobResolved {
            job: ctx.accounts.job.key(),
            to: ctx.accounts.recipient_token.key(),
        });
        Ok(())
    }

    pub fn refund(ctx: Context<Settle>) -> Result<()> {
        require!(
            ctx.accounts.job.kind == EscrowKind::Job,
            JobEscrowError::InvalidKind
        );
        require!(
            ctx.accounts.job.state == JobState::Open,
            JobEscrowError::InvalidState
        );
        require!(
            ctx.accounts.actor.key() == ctx.accounts.job.client,
            JobEscrowError::Unauthorized
        );
        require!(
            ctx.accounts.recipient_token.owner == ctx.accounts.job.client,
            JobEscrowError::Unauthorized
        );
        release(
            &mut ctx.accounts.job,
            &ctx.accounts.vault_token,
            &ctx.accounts.recipient_token,
            &ctx.accounts.fee_token,
            &ctx.accounts.token_program,
            false,
        )?;
        ctx.accounts.job.state = JobState::Refunded;
        emit!(JobRefunded {
            job: ctx.accounts.job.key()
        });
        Ok(())
    }

    /// Award a bounty: the controller (server/council) is the sole disburser and
    /// picks the winner. Releases the whole available pot (minus rake) to an
    /// arbitrary `recipient_token`. Bounties have no delivery/dispute lifecycle —
    /// they go straight from `Open` to `Resolved`.
    pub fn award_bounty(ctx: Context<Settle>) -> Result<()> {
        require!(
            ctx.accounts.job.kind == EscrowKind::Bounty,
            JobEscrowError::InvalidKind
        );
        require!(
            ctx.accounts.job.state == JobState::Open,
            JobEscrowError::InvalidState
        );
        require!(
            ctx.accounts.actor.key() == ctx.accounts.job.controller,
            JobEscrowError::Unauthorized
        );
        // The winner is whoever the controller pays; record it for indexers.
        let winner = ctx.accounts.recipient_token.owner;
        release(
            &mut ctx.accounts.job,
            &ctx.accounts.vault_token,
            &ctx.accounts.recipient_token,
            &ctx.accounts.fee_token,
            &ctx.accounts.token_program,
            true,
        )?;
        ctx.accounts.job.provider = winner;
        ctx.accounts.job.state = JobState::Resolved;
        emit!(BountyAwarded {
            job: ctx.accounts.job.key(),
            to: ctx.accounts.recipient_token.key(),
            winner,
        });
        Ok(())
    }

    /// Cancel an un-awarded bounty: controller-only (the sponsor cannot claw the
    /// pot back mid-bounty). Refunds the whole pot to the sponsor with no rake.
    pub fn cancel_bounty(ctx: Context<Settle>) -> Result<()> {
        require!(
            ctx.accounts.job.kind == EscrowKind::Bounty,
            JobEscrowError::InvalidKind
        );
        require!(
            ctx.accounts.job.state == JobState::Open,
            JobEscrowError::InvalidState
        );
        require!(
            ctx.accounts.actor.key() == ctx.accounts.job.controller,
            JobEscrowError::Unauthorized
        );
        require!(
            ctx.accounts.recipient_token.owner == ctx.accounts.job.client,
            JobEscrowError::Unauthorized
        );
        release(
            &mut ctx.accounts.job,
            &ctx.accounts.vault_token,
            &ctx.accounts.recipient_token,
            &ctx.accounts.fee_token,
            &ctx.accounts.token_program,
            false,
        )?;
        ctx.accounts.job.state = JobState::Refunded;
        emit!(JobRefunded {
            job: ctx.accounts.job.key()
        });
        Ok(())
    }
}

fn deposit(
    job: &mut Account<Job>,
    nonce_tracker: &mut Account<NonceTracker>,
    payload: PaymentPayload,
) -> Result<()> {
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp <= payload.expiry,
        JobEscrowError::Expired
    );
    require!(payload.amount > 0, JobEscrowError::InvalidAmount);
    require!(
        math::nonce_ok(nonce_tracker.last_nonce, payload.nonce),
        JobEscrowError::NonceUsed
    );
    nonce_tracker.last_nonce = payload.nonce;
    job.deposited = job
        .deposited
        .checked_add(payload.amount)
        .ok_or(JobEscrowError::MathOverflow)?;
    Ok(())
}

fn release<'info>(
    job: &mut Account<'info, Job>,
    vault_token: &Account<'info, TokenAccount>,
    recipient_token: &Account<'info, TokenAccount>,
    fee_token: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    take_fee: bool,
) -> Result<()> {
    require!(
        vault_token.key() == job.vault_token,
        JobEscrowError::InvalidVault
    );
    require!(
        fee_token.key() == job.fee_account,
        JobEscrowError::InvalidFeeAccount
    );

    let available =
        math::available(job.deposited, job.disbursed).ok_or(JobEscrowError::MathOverflow)?;
    let (amount, fee) =
        math::rake(available, job.fee_bps, take_fee).ok_or(JobEscrowError::MathOverflow)?;
    let new_disbursed = math::apply_disburse(job.deposited, job.disbursed, amount, fee)
        .ok_or(JobEscrowError::InsufficientFunds)?;

    let job_id = job.job_id;
    let seeds: &[&[u8]] = &[b"job", job_id.as_ref(), &[job.bump]];
    let signer_seeds = &[seeds];

    if amount > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                token_program.key(),
                Transfer {
                    from: vault_token.to_account_info(),
                    to: recipient_token.to_account_info(),
                    authority: job.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;
    }
    if fee > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                token_program.key(),
                Transfer {
                    from: vault_token.to_account_info(),
                    to: fee_token.to_account_info(),
                    authority: job.to_account_info(),
                },
                signer_seeds,
            ),
            fee,
        )?;
    }

    job.disbursed = new_disbursed;
    emit!(Disbursed {
        job: job.key(),
        to: recipient_token.key(),
        amount,
        fee,
        disbursed: job.disbursed,
    });
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum JobState {
    Open,
    Delivered,
    Disputed,
    Resolved,
    Refunded,
}

/// Distinguishes the two escrow flavors that share this account + custody model.
/// They differ only in who may disburse the vault:
///   * `Job`    — the client approves (provider path) / disputes; the controller
///                only steps in to `resolve` a dispute.
///   * `Bounty` — the controller (server/council of agents) is the *sole*
///                disburser: it `award`s the pot to a winner it picks, or
///                `cancel`s back to the sponsor. The client cannot self-approve.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum EscrowKind {
    Job,
    Bounty,
}

#[account]
pub struct Job {
    pub job_id: [u8; 32],
    pub client: Pubkey,
    pub provider: Pubkey,
    pub controller: Pubkey,
    pub mint: Pubkey,
    pub vault_token: Pubkey,
    pub fee_account: Pubkey,
    pub deposited: u64,
    pub disbursed: u64,
    pub fee_bps: u16,
    pub state: JobState,
    pub bump: u8,
    // `kind` is appended last so every byte offset above stays stable for
    // off-chain parsers that read the account by fixed offset.
    pub kind: EscrowKind,
}

impl Job {
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 32 + 32 + 32 + 32 + 8 + 8 + 2 + 1 + 1 + 1;
}

#[account]
pub struct NonceTracker {
    pub owner: Pubkey,
    pub last_nonce: u64,
    pub bump: u8,
}

impl NonceTracker {
    pub const SIZE: usize = 8 + 32 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct PaymentPayload {
    pub amount: u64,
    pub payer: Pubkey,
    pub payee: Pubkey,
    pub nonce: u64,
    pub expiry: i64,
}

#[derive(Accounts)]
#[instruction(job_id: [u8; 32])]
pub struct CreateJob<'info> {
    #[account(
        init,
        payer = client,
        space = Job::SIZE,
        seeds = [b"job", job_id.as_ref()],
        bump
    )]
    pub job: Account<'info, Job>,
    #[account(
        init,
        payer = client,
        token::mint = mint,
        token::authority = job,
    )]
    pub vault_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub client: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(constraint = fee_account.mint == mint.key() @ JobEscrowError::InvalidFeeAccount)]
    pub fee_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitNonce<'info> {
    #[account(
        init,
        payer = owner,
        space = NonceTracker::SIZE,
        seeds = [b"nonce", owner.key().as_ref()],
        bump
    )]
    pub nonce_tracker: Account<'info, NonceTracker>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(payload: PaymentPayload)]
pub struct Fund<'info> {
    #[account(mut)]
    pub job: Account<'info, Job>,
    #[account(
        mut,
        seeds = [b"nonce", payload.payer.as_ref()],
        bump = nonce_tracker.bump,
    )]
    pub nonce_tracker: Account<'info, NonceTracker>,
    #[account(mut)]
    pub client: Signer<'info>,
    #[account(mut, constraint = client_token.owner == client.key() @ JobEscrowError::Unauthorized)]
    pub client_token: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = vault_token.key() == job.vault_token @ JobEscrowError::InvalidVault,
    )]
    pub vault_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(payload: PaymentPayload)]
pub struct FundFor<'info> {
    #[account(mut)]
    pub job: Account<'info, Job>,
    #[account(
        mut,
        seeds = [b"nonce", payload.payer.as_ref()],
        bump = nonce_tracker.bump,
    )]
    pub nonce_tracker: Account<'info, NonceTracker>,
    pub authority: Signer<'info>,
    #[account(mut, constraint = client_token.owner == payload.payer @ JobEscrowError::Unauthorized)]
    pub client_token: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = vault_token.key() == job.vault_token @ JobEscrowError::InvalidVault,
    )]
    pub vault_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateJob<'info> {
    #[account(mut)]
    pub job: Account<'info, Job>,
    pub actor: Signer<'info>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(mut)]
    pub job: Account<'info, Job>,
    pub actor: Signer<'info>,
    #[account(
        mut,
        constraint = vault_token.key() == job.vault_token @ JobEscrowError::InvalidVault,
    )]
    pub vault_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub recipient_token: Account<'info, TokenAccount>,
    #[account(mut, constraint = fee_token.key() == job.fee_account @ JobEscrowError::InvalidFeeAccount)]
    pub fee_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[event]
pub struct JobCreated {
    pub job: Pubkey,
    pub job_id: [u8; 32],
    pub client: Pubkey,
    pub provider: Pubkey,
    pub mint: Pubkey,
    pub vault_token: Pubkey,
}

#[event]
pub struct Deposited {
    pub job: Pubkey,
    pub payer: Pubkey,
    pub amount: u64,
    pub nonce: u64,
    pub deposited: u64,
}

#[event]
pub struct Disbursed {
    pub job: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub fee: u64,
    pub disbursed: u64,
}

#[event]
pub struct JobDelivered {
    pub job: Pubkey,
}

#[event]
pub struct JobDisputed {
    pub job: Pubkey,
    pub by: Pubkey,
}

#[event]
pub struct JobResolved {
    pub job: Pubkey,
    pub to: Pubkey,
}

#[event]
pub struct JobRefunded {
    pub job: Pubkey,
}

#[event]
pub struct BountyCreated {
    pub job: Pubkey,
    pub job_id: [u8; 32],
    pub sponsor: Pubkey,
    pub controller: Pubkey,
    pub mint: Pubkey,
    pub vault_token: Pubkey,
}

#[event]
pub struct BountyAwarded {
    pub job: Pubkey,
    pub to: Pubkey,
    pub winner: Pubkey,
}

#[error_code]
pub enum JobEscrowError {
    #[msg("Invalid job state for this operation")]
    InvalidState,
    #[msg("Operation not valid for this escrow kind (job vs bounty)")]
    InvalidKind,
    #[msg("Unauthorized caller")]
    Unauthorized,
    #[msg("Fee basis points must be below 10000")]
    InvalidFee,
    #[msg("Job vault token account does not match")]
    InvalidVault,
    #[msg("Fee token account does not match the job fee account")]
    InvalidFeeAccount,
    #[msg("Payment has expired")]
    Expired,
    #[msg("Nonce already used")]
    NonceUsed,
    #[msg("Amount must be positive")]
    InvalidAmount,
    #[msg("Insufficient available funds")]
    InsufficientFunds,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
