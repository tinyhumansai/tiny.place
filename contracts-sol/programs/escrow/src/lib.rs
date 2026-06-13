use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

pub mod math;

declare_id!("FNCnjUKR1YbEJwcjWWHJzWxgp2vbSjjHcBZaAshybhLq");

/// Seed a settlement program must use for the PDA that authorizes disbursement.
/// Escrow recomputes `PDA([VAULT_AUTHORITY_SEED], settlement_program)` and
/// requires it to sign `disburse`, so the custody/policy binding is trustless:
/// only the registered settlement program can move a vault's funds.
pub const VAULT_AUTHORITY_SEED: &[u8] = b"vault_authority";

/// The escrow program is pure custody + accounting. It holds funds in per-vault
/// token accounts, accepts x402 deposits, and releases funds **only** when the
/// registered settlement program (settlement_job, settlement_game_poker, …)
/// authorizes a `disburse` — specifying recipient, amount, and fee. It contains
/// no job or game logic of its own.
#[program]
pub mod escrow {
    use super::*;

    /// Open a vault bound to a settlement program. The vault's disburse
    /// authority is fixed to that program's `vault_authority` PDA. Typically
    /// invoked via CPI by the settlement program at job/game creation.
    pub fn create_vault(
        ctx: Context<CreateVault>,
        vault_id: [u8; 32],
        settlement_program: Pubkey,
    ) -> Result<()> {
        let (authority, _) =
            Pubkey::find_program_address(&[VAULT_AUTHORITY_SEED], &settlement_program);

        let vault = &mut ctx.accounts.vault;
        vault.vault_id = vault_id;
        vault.settlement_program = settlement_program;
        vault.authority = authority;
        vault.mint = ctx.accounts.mint.key();
        vault.fee_account = ctx.accounts.fee_account.key();
        vault.deposited = 0;
        vault.disbursed = 0;
        vault.state = VaultState::Open;
        vault.bump = ctx.bumps.vault;

        emit!(VaultOpened {
            vault: vault.key(),
            vault_id,
            settlement_program,
            authority,
            mint: vault.mint,
        });
        Ok(())
    }

    /// Initialize a per-payer x402 nonce tracker (one-time, before first deposit).
    pub fn init_nonce(ctx: Context<InitNonce>) -> Result<()> {
        let tracker = &mut ctx.accounts.nonce_tracker;
        tracker.owner = ctx.accounts.owner.key();
        tracker.last_nonce = 0;
        tracker.bump = ctx.bumps.nonce_tracker;
        Ok(())
    }

    /// x402-compatible deposit into a vault. Replay-protected by a per-payer
    /// monotonic nonce and an expiry. Anyone may deposit; settlement programs
    /// wrap this via CPI so they can record their own per-depositor entries
    /// atomically.
    pub fn deposit(ctx: Context<Deposit>, payload: PaymentPayload) -> Result<()> {
        let clock = Clock::get()?;
        require!(clock.unix_timestamp <= payload.expiry, EscrowError::Expired);
        require!(
            ctx.accounts.vault.state == VaultState::Open,
            EscrowError::VaultClosed
        );
        require!(
            payload.payer == ctx.accounts.payer.key(),
            EscrowError::Unauthorized
        );
        require!(payload.amount > 0, EscrowError::InvalidAmount);

        let tracker = &mut ctx.accounts.nonce_tracker;
        require!(
            math::nonce_ok(tracker.last_nonce, payload.nonce),
            EscrowError::NonceUsed
        );
        tracker.last_nonce = payload.nonce;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.payer_token.to_account_info(),
                    to: ctx.accounts.vault_token.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            payload.amount,
        )?;

        let vault = &mut ctx.accounts.vault;
        vault.deposited = vault
            .deposited
            .checked_add(payload.amount)
            .ok_or(EscrowError::MathOverflow)?;

        emit!(Deposited {
            vault: vault.key(),
            payer: payload.payer,
            amount: payload.amount,
            payment_id: payment_id(&payload),
            deposited: vault.deposited,
        });
        Ok(())
    }

    /// Release `amount` to a recipient and `fee` to the vault's fee account.
    /// Authorized only by the settlement program's `vault_authority` PDA signer.
    /// The escrow signs the actual SPL transfer with its own vault PDA.
    pub fn disburse(ctx: Context<Disburse>, amount: u64, fee: u64) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.vault.authority,
            EscrowError::Unauthorized
        );
        require!(
            ctx.accounts.fee_token.key() == ctx.accounts.vault.fee_account,
            EscrowError::InvalidFeeAccount
        );

        let new_disbursed = math::apply_disburse(
            ctx.accounts.vault.deposited,
            ctx.accounts.vault.disbursed,
            amount,
            fee,
        )
        .ok_or(EscrowError::InsufficientFunds)?;

        let vault_id = ctx.accounts.vault.vault_id;
        let seeds: &[&[u8]] = &[b"vault", vault_id.as_ref(), &[ctx.accounts.vault.bump]];
        let signer_seeds = &[seeds];

        if amount > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault_token.to_account_info(),
                        to: ctx.accounts.recipient_token.to_account_info(),
                        authority: ctx.accounts.vault.to_account_info(),
                    },
                    signer_seeds,
                ),
                amount,
            )?;
        }
        if fee > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault_token.to_account_info(),
                        to: ctx.accounts.fee_token.to_account_info(),
                        authority: ctx.accounts.vault.to_account_info(),
                    },
                    signer_seeds,
                ),
                fee,
            )?;
        }

        let vault = &mut ctx.accounts.vault;
        vault.disbursed = new_disbursed;

        emit!(Disbursed {
            vault: vault.key(),
            to: ctx.accounts.recipient_token.key(),
            amount,
            fee,
            disbursed: vault.disbursed,
        });
        Ok(())
    }
}

/// Deterministic id for an x402 payment, for off-chain reconciliation.
fn payment_id(payload: &PaymentPayload) -> [u8; 32] {
    let mut data = Vec::new();
    data.extend_from_slice(&payload.amount.to_le_bytes());
    data.extend_from_slice(payload.payer.as_ref());
    data.extend_from_slice(payload.payee.as_ref());
    data.extend_from_slice(&payload.nonce.to_le_bytes());
    data.extend_from_slice(&payload.expiry.to_le_bytes());
    anchor_lang::solana_program::keccak::hash(&data).to_bytes()
}

// --- State ---

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum VaultState {
    Open,
    Closed,
}

/// A custody vault: funds live in a separate `vault_token` account whose
/// authority is the vault PDA. `deposited - disbursed` is the available balance.
#[account]
pub struct Vault {
    pub vault_id: [u8; 32],
    pub settlement_program: Pubkey,
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub fee_account: Pubkey,
    pub deposited: u64,
    pub disbursed: u64,
    pub state: VaultState,
    pub bump: u8,
}

impl Vault {
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 32 + 32 + 8 + 8 + 1 + 1;
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

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PaymentPayload {
    pub amount: u64,
    pub payer: Pubkey,
    pub payee: Pubkey,
    pub nonce: u64,
    pub expiry: i64,
}

// --- Contexts ---

#[derive(Accounts)]
#[instruction(vault_id: [u8; 32])]
pub struct CreateVault<'info> {
    #[account(
        init,
        payer = creator,
        space = Vault::SIZE,
        seeds = [b"vault", vault_id.as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(
        init,
        payer = creator,
        token::mint = mint,
        token::authority = vault,
    )]
    pub vault_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub mint: Account<'info, Mint>,
    /// CHECK: token account that receives the fee on disburse; verified by key on disburse
    pub fee_account: AccountInfo<'info>,
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
pub struct Deposit<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [b"nonce", payload.payer.as_ref()],
        bump = nonce_tracker.bump,
    )]
    pub nonce_tracker: Account<'info, NonceTracker>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, constraint = payer_token.owner == payer.key() @ EscrowError::Unauthorized)]
    pub payer_token: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = vault_token.owner == vault.key() @ EscrowError::InvalidVault,
        constraint = vault_token.mint == vault.mint @ EscrowError::InvalidVault,
    )]
    pub vault_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Disburse<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    /// The settlement program's `vault_authority` PDA, signing via CPI.
    pub authority: Signer<'info>,
    #[account(
        mut,
        constraint = vault_token.owner == vault.key() @ EscrowError::InvalidVault,
    )]
    pub vault_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub recipient_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub fee_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

// --- Events ---

#[event]
pub struct VaultOpened {
    pub vault: Pubkey,
    pub vault_id: [u8; 32],
    pub settlement_program: Pubkey,
    pub authority: Pubkey,
    pub mint: Pubkey,
}

#[event]
pub struct Deposited {
    pub vault: Pubkey,
    pub payer: Pubkey,
    pub amount: u64,
    pub payment_id: [u8; 32],
    pub deposited: u64,
}

#[event]
pub struct Disbursed {
    pub vault: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub fee: u64,
    pub disbursed: u64,
}

// --- Errors ---

#[error_code]
pub enum EscrowError {
    #[msg("Unauthorized caller")]
    Unauthorized,
    #[msg("Vault is closed")]
    VaultClosed,
    #[msg("Vault token account does not belong to this vault")]
    InvalidVault,
    #[msg("Fee token account does not match the vault fee account")]
    InvalidFeeAccount,
    #[msg("Payment has expired")]
    Expired,
    #[msg("Nonce already used")]
    NonceUsed,
    #[msg("Amount must be positive")]
    InvalidAmount,
    #[msg("Insufficient available funds in vault")]
    InsufficientFunds,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
