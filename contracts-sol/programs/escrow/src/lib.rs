use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

pub mod math;

declare_id!("6s1cWEMcWjWZ3ut6aDD5g4CFBxpKBz5S4DLkrZdy5jR2");

// On-chain security contact (read by explorers like Solscan). Guarded so it is
// not linked in when escrow is pulled into a settlement program as a CPI
// dependency (those builds enable `no-entrypoint`, which strips this).
#[cfg(not(feature = "no-entrypoint"))]
solana_security_txt::security_txt! {
    name: "tiny.place escrow (custody)",
    project_url: "https://tiny.place",
    contacts: "email:security@tinyhumans.ai",
    policy: "https://github.com/tinyhumansai/tiny.place/blob/main/SECURITY.md",
    source_code: "https://github.com/tinyhumansai/tiny.place",
    preferred_languages: "en"
}

/// Seed a settlement program must use for the PDA that authorizes disbursement.
/// Escrow recomputes `PDA([VAULT_AUTHORITY_SEED], settlement_program)` and
/// requires it to sign `disburse`, so the custody/policy binding is trustless:
/// only the registered settlement program can move a vault's funds.
pub const VAULT_AUTHORITY_SEED: &[u8] = b"vault_authority";

/// The escrow program is pure custody + accounting. It holds funds in per-vault
/// token accounts, accepts x402 deposits, and releases funds **only** when the
/// registered settlement program (for example, settlement_job)
/// authorizes a `disburse` — specifying recipient, amount, and fee. It contains
/// no job or game logic of its own.
#[program]
pub mod escrow {
    use super::*;

    /// Open a vault bound to a settlement program. The vault's disburse
    /// authority is fixed to that program's `vault_authority` PDA. Typically
    /// invoked via CPI by the settlement program at job creation.
    pub fn create_vault(
        ctx: Context<CreateVault>,
        vault_id: [u8; 32],
        settlement_program: Pubkey,
        owner: Pubkey,
    ) -> Result<()> {
        let (authority, _) =
            Pubkey::find_program_address(&[VAULT_AUTHORITY_SEED], &settlement_program);

        let vault = &mut ctx.accounts.vault;
        vault.vault_id = vault_id;
        vault.settlement_program = settlement_program;
        vault.owner = owner;
        vault.authority = authority;
        vault.mint = ctx.accounts.mint.key();
        vault.token_account = ctx.accounts.vault_token.key();
        vault.fee_account = ctx.accounts.fee_account.key();
        vault.deposited = 0;
        vault.disbursed = 0;
        vault.state = VaultState::Open;
        vault.bump = ctx.bumps.vault;

        emit!(VaultOpened {
            vault: vault.key(),
            vault_id,
            settlement_program,
            owner,
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
                ctx.accounts.token_program.key(),
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
            nonce: payload.nonce,
            deposited: vault.deposited,
        });
        Ok(())
    }

    /// Delegated deposit: move `payload.amount` from the payer's token account
    /// into the vault, authorized by a session-wallet **delegate** rather than
    /// the payer. The payer never signs — they `approve`d the delegate once, and
    /// the SPL token program enforces that approval (delegate + delegated_amount)
    /// on the transfer. The deposit is recorded against `payload.payer` (the
    /// source token account's owner), and a server fee-payer pays the gas. This
    /// is the escrow counterpart of an off-chain x402 session/delegate payment.
    pub fn deposit_for(ctx: Context<DepositFor>, payload: PaymentPayload) -> Result<()> {
        let clock = Clock::get()?;
        require!(clock.unix_timestamp <= payload.expiry, EscrowError::Expired);
        require!(
            ctx.accounts.vault.state == VaultState::Open,
            EscrowError::VaultClosed
        );
        // The deposit is credited to the source token account's owner; the
        // payload must name that same owner so it cannot be misattributed.
        require!(
            payload.payer == ctx.accounts.payer_token.owner,
            EscrowError::Unauthorized
        );
        require!(payload.amount > 0, EscrowError::InvalidAmount);

        let tracker = &mut ctx.accounts.nonce_tracker;
        require!(
            math::nonce_ok(tracker.last_nonce, payload.nonce),
            EscrowError::NonceUsed
        );
        tracker.last_nonce = payload.nonce;

        // authority is the delegate; the token program rejects this unless the
        // payer approved it on payer_token for at least payload.amount.
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.payer_token.to_account_info(),
                    to: ctx.accounts.vault_token.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
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
            nonce: payload.nonce,
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
                    ctx.accounts.token_program.key(),
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
                    ctx.accounts.token_program.key(),
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

// --- State ---

/// Lifecycle of a vault. A vault is `Open` from creation; `Closed` is reserved
/// for a future explicit close path (today vaults simply reach a zero balance
/// once their settlement program has disbursed everything).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum VaultState {
    /// Accepting deposits and disbursements.
    Open,
    /// No longer accepting deposits (reserved; not set by current instructions).
    Closed,
}

/// A custody vault — the on-chain home of escrowed funds for one job or game.
///
/// The tokens themselves live in a separate SPL token account (`token_account`)
/// whose authority is this vault's PDA, so only the escrow program can move
/// them. This account holds only the accounting and the binding to a settlement
/// program; `deposited - disbursed` is the currently available balance.
///
/// PDA: `["vault", vault_id]` under the escrow program.
#[account]
pub struct Vault {
    /// Caller-supplied 32-byte id; also the PDA seed. Lets a single deployed
    /// escrow program hold an unbounded, id-mapped set of independent vaults.
    pub vault_id: [u8; 32],
    /// The settlement program (for example, settlement_job) that
    /// is allowed to disburse this vault's funds.
    pub settlement_program: Pubkey,
    /// The single job record (the settlement program's PDA) this vault is
    /// bound to. Set once at creation; the settlement program enforces that the
    /// registering job's key equals this value, so a vault can only ever be
    /// claimed — and therefore disbursed — by one job/game. This is what makes
    /// the custody binding 1:1, preventing a third party from registering a
    /// competing job against an already-funded vault to drain it.
    pub owner: Pubkey,
    /// The exact signer required on `disburse`, fixed at creation to
    /// `PDA(["vault_authority"], settlement_program)`. Recomputing it here makes
    /// the custody↔policy binding trustless.
    pub authority: Pubkey,
    /// SPL mint of the escrowed asset.
    pub mint: Pubkey,
    /// The one token account this vault deposits into and disburses from, pinned
    /// at creation so on-chain balances can never desync from the accounting.
    pub token_account: Pubkey,
    /// Token account that receives the platform fee on every disburse.
    pub fee_account: Pubkey,
    /// Running total deposited into the vault (base units).
    pub deposited: u64,
    /// Running total released out of the vault, fees included (base units).
    pub disbursed: u64,
    /// Lifecycle state.
    pub state: VaultState,
    /// Cached PDA bump for `["vault", vault_id]`, used to sign transfers.
    pub bump: u8,
}

impl Vault {
    /// Account size: 8 discriminator + vault_id(32) + 5×Pubkey(160)
    /// (settlement_program, owner, authority, mint, token_account) +
    /// fee_account(32) + deposited(8) + disbursed(8) + state(1) + bump(1).
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 32 + 32 + 32 + 32 + 8 + 8 + 1 + 1;
}

/// Per-payer replay guard for x402 deposits. The accepted nonce must strictly
/// increase, so a captured payment can never be replayed.
///
/// PDA: `["nonce", owner]` under the escrow program.
#[account]
pub struct NonceTracker {
    /// The payer this tracker belongs to.
    pub owner: Pubkey,
    /// Highest nonce accepted so far; the next deposit must exceed it.
    pub last_nonce: u64,
    /// Cached PDA bump.
    pub bump: u8,
}

impl NonceTracker {
    /// Account size: 8 discriminator + owner(32) + last_nonce(8) + bump(1).
    pub const SIZE: usize = 8 + 32 + 8 + 1;
}

/// An x402 payment authorization, passed to `deposit`. Mirrors the off-chain
/// x402 `PaymentPayload` so a signed HTTP-402 authorization maps directly to an
/// on-chain deposit.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PaymentPayload {
    /// Amount to deposit, in token base units.
    pub amount: u64,
    /// The paying account; must equal the transaction's `payer` signer.
    pub payer: Pubkey,
    /// The intended payee (recorded in the payment id; not used for transfer
    /// routing, since funds always land in the vault token account).
    pub payee: Pubkey,
    /// Monotonic nonce for replay protection (must exceed the tracker's last).
    pub nonce: u64,
    /// Unix expiry; the deposit is rejected once `Clock` passes it.
    pub expiry: i64,
}

// --- Contexts ---

/// Accounts for [`escrow::create_vault`]. Initializes the vault PDA and its
/// dedicated token account in one instruction.
#[derive(Accounts)]
#[instruction(vault_id: [u8; 32])]
pub struct CreateVault<'info> {
    /// The vault account being created; PDA `["vault", vault_id]`.
    #[account(
        init,
        payer = creator,
        space = Vault::SIZE,
        seeds = [b"vault", vault_id.as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    /// The vault's token account, created here with the vault PDA as authority.
    /// A fresh keypair supplied by the caller; pinned into `vault.token_account`.
    #[account(
        init,
        payer = creator,
        token::mint = mint,
        token::authority = vault,
    )]
    pub vault_token: Account<'info, TokenAccount>,
    /// Pays rent for the new accounts; need not be a party to the job/game.
    #[account(mut)]
    pub creator: Signer<'info>,
    /// SPL mint of the escrowed asset.
    pub mint: Account<'info, Mint>,
    /// Token account that receives the fee on disburse. Constrained to be a
    /// real SPL token account of the vault's `mint`, so a malformed or
    /// wrong-mint fee account can never be stored — which would otherwise brick
    /// every fee-bearing `disburse` and permanently lock the vault's principal.
    #[account(constraint = fee_account.mint == mint.key() @ EscrowError::InvalidFeeAccount)]
    pub fee_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
}

/// Accounts for [`escrow::init_nonce`]. One-time setup of a payer's replay guard.
#[derive(Accounts)]
pub struct InitNonce<'info> {
    /// The tracker being created; PDA `["nonce", owner]`.
    #[account(
        init,
        payer = owner,
        space = NonceTracker::SIZE,
        seeds = [b"nonce", owner.key().as_ref()],
        bump
    )]
    pub nonce_tracker: Account<'info, NonceTracker>,
    /// The payer this tracker is for; pays its rent and signs.
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Accounts for [`escrow::deposit`]. Moves `payload.amount` from the payer's
/// token account into the vault's pinned token account.
#[derive(Accounts)]
#[instruction(payload: PaymentPayload)]
pub struct Deposit<'info> {
    /// Vault being funded; its `deposited` total is incremented.
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    /// The payer's replay guard, keyed by `payload.payer`.
    #[account(
        mut,
        seeds = [b"nonce", payload.payer.as_ref()],
        bump = nonce_tracker.bump,
    )]
    pub nonce_tracker: Account<'info, NonceTracker>,
    /// The depositing wallet; must equal `payload.payer`.
    #[account(mut)]
    pub payer: Signer<'info>,
    /// Source token account, owned by the payer.
    #[account(mut, constraint = payer_token.owner == payer.key() @ EscrowError::Unauthorized)]
    pub payer_token: Account<'info, TokenAccount>,
    /// Destination — must be the vault's pinned token account.
    #[account(
        mut,
        constraint = vault_token.key() == vault.token_account @ EscrowError::InvalidVault,
    )]
    pub vault_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

/// Accounts for [`escrow::deposit_for`]. Identical to [`Deposit`] except the
/// signer is the session-wallet **delegate** (`authority`), not the payer — the
/// payer never signs. The SPL token program enforces that `authority` is an
/// approved delegate of `payer_token` for at least `payload.amount`.
#[derive(Accounts)]
#[instruction(payload: PaymentPayload)]
pub struct DepositFor<'info> {
    /// Vault being funded; its `deposited` total is incremented.
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    /// The payer's replay guard, keyed by `payload.payer` (NOT the delegate).
    #[account(
        mut,
        seeds = [b"nonce", payload.payer.as_ref()],
        bump = nonce_tracker.bump,
    )]
    pub nonce_tracker: Account<'info, NonceTracker>,
    /// The session-wallet delegate authorizing the transfer. Signs the tx; the
    /// token program checks it was `approve`d on `payer_token`.
    pub authority: Signer<'info>,
    /// Source token account, owned by `payload.payer` (the recorded depositor).
    #[account(mut, constraint = payer_token.owner == payload.payer @ EscrowError::Unauthorized)]
    pub payer_token: Account<'info, TokenAccount>,
    /// Destination — must be the vault's pinned token account.
    #[account(
        mut,
        constraint = vault_token.key() == vault.token_account @ EscrowError::InvalidVault,
    )]
    pub vault_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

/// Accounts for [`escrow::disburse`]. Releases funds out of the vault; callable
/// only by the bound settlement program's `vault_authority` PDA.
#[derive(Accounts)]
pub struct Disburse<'info> {
    /// Vault being drained; its `disbursed` total is incremented.
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    /// The settlement program's `vault_authority` PDA, signing via CPI. Must
    /// equal `vault.authority`.
    pub authority: Signer<'info>,
    /// Source of funds — the vault's pinned token account.
    #[account(
        mut,
        constraint = vault_token.key() == vault.token_account @ EscrowError::InvalidVault,
    )]
    pub vault_token: Account<'info, TokenAccount>,
    /// Where the `amount` goes (winner / provider / refunded client).
    #[account(mut)]
    pub recipient_token: Account<'info, TokenAccount>,
    /// Where the `fee` goes — must equal `vault.fee_account`.
    #[account(mut)]
    pub fee_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

// --- Events ---

/// Emitted when a vault is created and bound to a settlement program.
#[event]
pub struct VaultOpened {
    pub vault: Pubkey,
    pub vault_id: [u8; 32],
    pub settlement_program: Pubkey,
    pub owner: Pubkey,
    pub authority: Pubkey,
    pub mint: Pubkey,
}

/// Emitted on every successful deposit; carries the payment `nonce` and the
/// running `deposited` total for off-chain reconciliation.
#[event]
pub struct Deposited {
    pub vault: Pubkey,
    pub payer: Pubkey,
    pub amount: u64,
    pub nonce: u64,
    pub deposited: u64,
}

/// Emitted on every disburse; `amount` went to `to`, `fee` to the fee account,
/// with the running `disbursed` total after the release.
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
