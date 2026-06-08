use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

pub mod x402;

declare_id!("EscrowX402111111111111111111111111111111111111");

#[program]
pub mod escrow {
    use super::*;

    pub fn create(ctx: Context<Create>, amount: u64) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        escrow.client = ctx.accounts.client.key();
        escrow.provider = ctx.accounts.provider.key();
        escrow.admin = ctx.accounts.admin.key();
        escrow.mint = ctx.accounts.mint.key();
        escrow.amount = amount;
        escrow.state = EscrowState::Open;
        escrow.bump = ctx.bumps.escrow;
        Ok(())
    }

    pub fn fund(ctx: Context<Fund>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(escrow.state == EscrowState::Open, EscrowError::InvalidState);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.client_token.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.client.to_account_info(),
                },
            ),
            escrow.amount,
        )?;

        emit!(Funded {
            escrow: ctx.accounts.escrow.key(),
            amount: escrow.amount,
        });
        Ok(())
    }

    pub fn mark_delivered(ctx: Context<MarkDelivered>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.state == EscrowState::Open, EscrowError::InvalidState);
        require!(
            ctx.accounts.provider.key() == escrow.provider,
            EscrowError::Unauthorized
        );

        escrow.state = EscrowState::Delivered;

        emit!(Delivered {
            escrow: ctx.accounts.escrow.key(),
        });
        Ok(())
    }

    pub fn approve(ctx: Context<Approve>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(
            escrow.state == EscrowState::Delivered,
            EscrowError::InvalidState
        );
        require!(
            ctx.accounts.client.key() == escrow.client,
            EscrowError::Unauthorized
        );

        escrow.state = EscrowState::Resolved;
        transfer_from_vault(&ctx.accounts.escrow, &ctx, ctx.accounts.provider_token.to_account_info())?;

        emit!(Released {
            escrow: ctx.accounts.escrow.key(),
            to: escrow.provider,
            amount: escrow.amount,
        });
        Ok(())
    }

    pub fn dispute(ctx: Context<Dispute>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(
            escrow.state == EscrowState::Delivered,
            EscrowError::InvalidState
        );
        let signer = ctx.accounts.signer.key();
        require!(
            signer == escrow.client || signer == escrow.provider,
            EscrowError::Unauthorized
        );

        escrow.state = EscrowState::Disputed;

        emit!(Disputed {
            escrow: ctx.accounts.escrow.key(),
            by: signer,
        });
        Ok(())
    }

    pub fn resolve(ctx: Context<Resolve>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(
            escrow.state == EscrowState::Disputed,
            EscrowError::InvalidState
        );
        require!(
            ctx.accounts.admin.key() == escrow.admin,
            EscrowError::Unauthorized
        );

        escrow.state = EscrowState::Resolved;
        transfer_from_vault(&ctx.accounts.escrow, &ctx, ctx.accounts.recipient_token.to_account_info())?;

        emit!(Resolved {
            escrow: ctx.accounts.escrow.key(),
            to: ctx.accounts.recipient_token.key(),
            amount: escrow.amount,
        });
        Ok(())
    }

    pub fn init_nonce(ctx: Context<x402::InitNonce>) -> Result<()> {
        x402::handle_init_nonce(ctx)
    }

    pub fn settle(ctx: Context<x402::Settle>, payload: x402::PaymentPayload) -> Result<()> {
        x402::handle_settle(ctx, payload)
    }

    pub fn settle_to_escrow(ctx: Context<x402::SettleToEscrow>, payload: x402::PaymentPayload) -> Result<()> {
        x402::handle_settle_to_escrow(ctx, payload)
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.state == EscrowState::Open, EscrowError::InvalidState);
        require!(
            ctx.accounts.client.key() == escrow.client,
            EscrowError::Unauthorized
        );

        escrow.state = EscrowState::Refunded;
        transfer_from_vault(&ctx.accounts.escrow, &ctx, ctx.accounts.client_token.to_account_info())?;

        emit!(Refunded {
            escrow: ctx.accounts.escrow.key(),
            amount: escrow.amount,
        });
        Ok(())
    }
}

fn transfer_from_vault<'info, T: ToAccountInfos<'info> + ToAccountMetas>(
    escrow: &Account<'info, EscrowAccount>,
    ctx: &Context<T>,
    to: AccountInfo<'info>,
) -> Result<()> {
    let seeds = &[
        b"escrow",
        escrow.client.as_ref(),
        escrow.provider.as_ref(),
        &[escrow.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.to_account_infos().last().unwrap().clone(),
            Transfer {
                from: ctx.accounts.to_account_infos()[3].clone(), // vault
                to,
                authority: escrow.to_account_info(),
            },
            signer_seeds,
        ),
        escrow.amount,
    )?;
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum EscrowState {
    Open,
    Delivered,
    Resolved,
    Disputed,
    Refunded,
}

#[account]
pub struct EscrowAccount {
    pub client: Pubkey,
    pub provider: Pubkey,
    pub admin: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub state: EscrowState,
    pub bump: u8,
}

impl EscrowAccount {
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 32 + 8 + 1 + 1;
}

// --- Contexts ---

#[derive(Accounts)]
pub struct Create<'info> {
    #[account(
        init,
        payer = client,
        space = EscrowAccount::SIZE,
        seeds = [b"escrow", client.key().as_ref(), provider.key().as_ref()],
        bump
    )]
    pub escrow: Account<'info, EscrowAccount>,
    #[account(mut)]
    pub client: Signer<'info>,
    /// CHECK: provider pubkey, not signing
    pub provider: AccountInfo<'info>,
    /// CHECK: admin pubkey, not signing
    pub admin: AccountInfo<'info>,
    /// CHECK: token mint
    pub mint: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Fund<'info> {
    pub escrow: Account<'info, EscrowAccount>,
    #[account(mut)]
    pub client: Signer<'info>,
    #[account(mut, constraint = client_token.owner == client.key())]
    pub client_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct MarkDelivered<'info> {
    #[account(mut)]
    pub escrow: Account<'info, EscrowAccount>,
    pub provider: Signer<'info>,
}

#[derive(Accounts)]
pub struct Approve<'info> {
    #[account(mut)]
    pub escrow: Account<'info, EscrowAccount>,
    pub client: Signer<'info>,
    #[account(mut)]
    pub provider_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Dispute<'info> {
    #[account(mut)]
    pub escrow: Account<'info, EscrowAccount>,
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct Resolve<'info> {
    #[account(mut)]
    pub escrow: Account<'info, EscrowAccount>,
    pub admin: Signer<'info>,
    #[account(mut)]
    pub recipient_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub escrow: Account<'info, EscrowAccount>,
    pub client: Signer<'info>,
    #[account(mut)]
    pub client_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

// --- Events ---

#[event]
pub struct Funded {
    pub escrow: Pubkey,
    pub amount: u64,
}

#[event]
pub struct Delivered {
    pub escrow: Pubkey,
}

#[event]
pub struct Released {
    pub escrow: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
}

#[event]
pub struct Disputed {
    pub escrow: Pubkey,
    pub by: Pubkey,
}

#[event]
pub struct Resolved {
    pub escrow: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
}

#[event]
pub struct Refunded {
    pub escrow: Pubkey,
    pub amount: u64,
}

// --- Errors ---

#[error_code]
pub enum EscrowError {
    #[msg("Invalid escrow state for this operation")]
    InvalidState,
    #[msg("Unauthorized caller")]
    Unauthorized,
    #[msg("Payment has expired")]
    Expired,
    #[msg("Nonce already used")]
    NonceUsed,
    #[msg("Amount mismatch")]
    InvalidAmount,
}
