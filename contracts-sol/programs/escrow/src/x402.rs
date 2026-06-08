use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{EscrowAccount, EscrowState, EscrowError};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PaymentPayload {
    pub amount: u64,
    pub payer: Pubkey,
    pub payee: Pubkey,
    pub nonce: u64,
    pub expiry: i64,
}

#[account]
pub struct PaymentRecord {
    pub payment_id: [u8; 32],
    pub payer: Pubkey,
    pub payee: Pubkey,
    pub amount: u64,
    pub escrow: Option<Pubkey>,
    pub settled: bool,
    pub bump: u8,
}

impl PaymentRecord {
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 8 + (1 + 32) + 1 + 1;
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

#[derive(Accounts)]
#[instruction(payload: PaymentPayload)]
pub struct Settle<'info> {
    #[account(
        init,
        payer = payer,
        space = PaymentRecord::SIZE,
        seeds = [b"payment", payload.payer.as_ref(), &payload.nonce.to_le_bytes()],
        bump
    )]
    pub payment_record: Account<'info, PaymentRecord>,
    #[account(
        mut,
        seeds = [b"nonce", payload.payer.as_ref()],
        bump = nonce_tracker.bump,
    )]
    pub nonce_tracker: Account<'info, NonceTracker>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, constraint = payer_token.owner == payer.key())]
    pub payer_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub payee_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(payload: PaymentPayload)]
pub struct SettleToEscrow<'info> {
    #[account(
        init,
        payer = payer,
        space = PaymentRecord::SIZE,
        seeds = [b"payment", payload.payer.as_ref(), &payload.nonce.to_le_bytes()],
        bump
    )]
    pub payment_record: Account<'info, PaymentRecord>,
    #[account(
        mut,
        seeds = [b"nonce", payload.payer.as_ref()],
        bump = nonce_tracker.bump,
    )]
    pub nonce_tracker: Account<'info, NonceTracker>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, constraint = payer_token.owner == payer.key())]
    pub payer_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub escrow: Account<'info, EscrowAccount>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
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

pub fn handle_init_nonce(ctx: Context<InitNonce>) -> Result<()> {
    let tracker = &mut ctx.accounts.nonce_tracker;
    tracker.owner = ctx.accounts.owner.key();
    tracker.last_nonce = 0;
    tracker.bump = ctx.bumps.nonce_tracker;
    Ok(())
}

pub fn handle_settle(ctx: Context<Settle>, payload: PaymentPayload) -> Result<()> {
    let clock = Clock::get()?;
    require!(clock.unix_timestamp <= payload.expiry, EscrowError::Expired);

    let tracker = &mut ctx.accounts.nonce_tracker;
    require!(payload.nonce > tracker.last_nonce, EscrowError::NonceUsed);
    tracker.last_nonce = payload.nonce;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.payer_token.to_account_info(),
                to: ctx.accounts.payee_token.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            },
        ),
        payload.amount,
    )?;

    let record = &mut ctx.accounts.payment_record;
    record.payment_id = payment_id(&payload);
    record.payer = payload.payer;
    record.payee = payload.payee;
    record.amount = payload.amount;
    record.escrow = None;
    record.settled = true;
    record.bump = ctx.bumps.payment_record;

    emit!(PaymentSettled {
        payment_id: record.payment_id,
        payer: payload.payer,
        payee: payload.payee,
        amount: payload.amount,
    });
    Ok(())
}

pub fn handle_settle_to_escrow(ctx: Context<SettleToEscrow>, payload: PaymentPayload) -> Result<()> {
    let clock = Clock::get()?;
    require!(clock.unix_timestamp <= payload.expiry, EscrowError::Expired);

    let tracker = &mut ctx.accounts.nonce_tracker;
    require!(payload.nonce > tracker.last_nonce, EscrowError::NonceUsed);
    tracker.last_nonce = payload.nonce;

    let escrow = &ctx.accounts.escrow;
    require!(escrow.client == payload.payer, EscrowError::Unauthorized);
    require!(escrow.amount == payload.amount, EscrowError::InvalidAmount);
    require!(escrow.state == EscrowState::Open, EscrowError::InvalidState);

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.payer_token.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            },
        ),
        payload.amount,
    )?;

    let record = &mut ctx.accounts.payment_record;
    record.payment_id = payment_id(&payload);
    record.payer = payload.payer;
    record.payee = payload.payee;
    record.amount = payload.amount;
    record.escrow = Some(ctx.accounts.escrow.key());
    record.settled = true;
    record.bump = ctx.bumps.payment_record;

    emit!(PaymentEscrowed {
        payment_id: record.payment_id,
        escrow: ctx.accounts.escrow.key(),
        amount: payload.amount,
    });
    Ok(())
}

fn payment_id(payload: &PaymentPayload) -> [u8; 32] {
    let mut data = Vec::new();
    data.extend_from_slice(&payload.amount.to_le_bytes());
    data.extend_from_slice(payload.payer.as_ref());
    data.extend_from_slice(payload.payee.as_ref());
    data.extend_from_slice(&payload.nonce.to_le_bytes());
    data.extend_from_slice(&payload.expiry.to_le_bytes());
    anchor_lang::solana_program::keccak::hash(&data).to_bytes()
}

#[event]
pub struct PaymentSettled {
    pub payment_id: [u8; 32],
    pub payer: Pubkey,
    pub payee: Pubkey,
    pub amount: u64,
}

#[event]
pub struct PaymentEscrowed {
    pub payment_id: [u8; 32],
    pub escrow: Pubkey,
    pub amount: u64,
}
