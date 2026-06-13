use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("CATBJS1qmZCCHJzNmdEwXNsBn1QYJoBuCg7yi8FTL8mG");

/// Basis-points denominator: `fee_bps` of 250 == 2.50%.
pub const BPS_DENOMINATOR: u64 = 10_000;
/// Upper bound on players in a single pot, keeps account math bounded.
pub const MAX_PLAYERS_CAP: u16 = 64;

/// Pooled, winner-take-all escrow for games and wagers.
///
/// N players each stake a fixed buy-in into a shared vault via an x402-signed
/// payment. A designated settler (the game server / room host oracle) declares
/// a single winner who takes the whole pot minus the platform rake. If the game
/// never resolves, the settler cancels and every player claims a refund.
#[program]
pub mod game {
    use super::*;

    pub fn create_game(
        ctx: Context<CreateGame>,
        game_id: [u8; 32],
        stake: u64,
        max_players: u16,
        fee_bps: u16,
    ) -> Result<()> {
        require!(stake > 0, GameError::InvalidAmount);
        require!(
            (2..=MAX_PLAYERS_CAP).contains(&max_players),
            GameError::InvalidPlayerCount
        );
        require!((fee_bps as u64) < BPS_DENOMINATOR, GameError::InvalidFee);

        let game = &mut ctx.accounts.game;
        game.game_id = game_id;
        game.settler = ctx.accounts.settler.key();
        game.mint = ctx.accounts.mint.key();
        game.fee_account = ctx.accounts.fee_account.key();
        game.stake = stake;
        game.max_players = max_players;
        game.fee_bps = fee_bps;
        game.pot = 0;
        game.player_count = 0;
        game.state = GameState::Open;
        game.bump = ctx.bumps.game;

        emit!(GameCreated {
            game: game.key(),
            settler: game.settler,
            stake,
            max_players,
        });
        Ok(())
    }

    /// Initialize a per-payer nonce tracker (one-time, before first `join`).
    pub fn init_nonce(ctx: Context<InitNonce>) -> Result<()> {
        let tracker = &mut ctx.accounts.nonce_tracker;
        tracker.owner = ctx.accounts.owner.key();
        tracker.last_nonce = 0;
        tracker.bump = ctx.bumps.nonce_tracker;
        Ok(())
    }

    /// x402-compatible buy-in: a player authorizes a signed payment payload to
    /// stake into the pot. Replay-protected by a per-payer monotonic nonce and
    /// an expiry timestamp.
    pub fn join(ctx: Context<Join>, payload: PaymentPayload) -> Result<()> {
        let clock = Clock::get()?;
        require!(clock.unix_timestamp <= payload.expiry, GameError::Expired);

        {
            let game = &ctx.accounts.game;
            require!(game.state == GameState::Open, GameError::InvalidState);
            require!(game.player_count < game.max_players, GameError::GameFull);
            require!(payload.amount == game.stake, GameError::InvalidAmount);
            require!(
                payload.payer == ctx.accounts.player.key(),
                GameError::Unauthorized
            );
        }

        let tracker = &mut ctx.accounts.nonce_tracker;
        require!(payload.nonce > tracker.last_nonce, GameError::NonceUsed);
        tracker.last_nonce = payload.nonce;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.player_token.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.player.to_account_info(),
                },
            ),
            payload.amount,
        )?;

        let game = &mut ctx.accounts.game;
        game.pot = game
            .pot
            .checked_add(payload.amount)
            .ok_or(GameError::MathOverflow)?;
        game.player_count = game
            .player_count
            .checked_add(1)
            .ok_or(GameError::MathOverflow)?;

        let entry = &mut ctx.accounts.player_entry;
        entry.game = game.key();
        entry.player = ctx.accounts.player.key();
        entry.amount = payload.amount;
        entry.refunded = false;
        entry.bump = ctx.bumps.player_entry;

        emit!(PlayerJoined {
            game: game.key(),
            player: entry.player,
            amount: payload.amount,
            payment_id: payment_id(&payload),
            pot: game.pot,
        });
        Ok(())
    }

    /// Designated settler declares the winner; the winner takes the whole pot
    /// minus the platform rake which is routed to the configured fee account.
    /// The winner must have an entry proving they joined the game.
    pub fn settle(ctx: Context<Settle>) -> Result<()> {
        require!(
            ctx.accounts.game.state == GameState::Open,
            GameError::InvalidState
        );
        require!(
            ctx.accounts.settler.key() == ctx.accounts.game.settler,
            GameError::Unauthorized
        );
        require!(
            ctx.accounts.game.player_count >= 2,
            GameError::NotEnoughPlayers
        );

        let pot = ctx.accounts.game.pot;
        let fee = (pot as u128)
            .checked_mul(ctx.accounts.game.fee_bps as u128)
            .and_then(|value| value.checked_div(BPS_DENOMINATOR as u128))
            .ok_or(GameError::MathOverflow)? as u64;
        let payout = pot.checked_sub(fee).ok_or(GameError::MathOverflow)?;

        pay_out(
            &ctx.accounts.game,
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.winner_token.to_account_info(),
            ctx.accounts.fee_token.to_account_info(),
            payout,
            fee,
        )?;

        let winner = ctx.accounts.winner_entry.player;
        let game = &mut ctx.accounts.game;
        game.state = GameState::Settled;

        emit!(GameSettled {
            game: game.key(),
            winner,
            payout,
            fee,
        });
        Ok(())
    }

    /// Settler cancels an unresolved game; players reclaim stakes via `claim_refund`.
    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        require!(game.state == GameState::Open, GameError::InvalidState);
        require!(
            ctx.accounts.settler.key() == game.settler,
            GameError::Unauthorized
        );

        game.state = GameState::Cancelled;
        emit!(GameCancelled { game: game.key() });
        Ok(())
    }

    /// A player reclaims their stake from a cancelled game.
    pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
        require!(
            ctx.accounts.game.state == GameState::Cancelled,
            GameError::InvalidState
        );
        require!(
            !ctx.accounts.player_entry.refunded,
            GameError::AlreadyRefunded
        );

        let amount = ctx.accounts.player_entry.amount;
        pay_out(
            &ctx.accounts.game,
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.player_token.to_account_info(),
            ctx.accounts.player_token.to_account_info(),
            amount,
            0,
        )?;

        let entry = &mut ctx.accounts.player_entry;
        entry.refunded = true;

        emit!(PlayerRefunded {
            game: ctx.accounts.game.key(),
            player: entry.player,
            amount,
        });
        Ok(())
    }
}

/// Move `payout` to `recipient` and `fee` to `fee_recipient`, signed by the game PDA.
fn pay_out<'info>(
    game: &Account<'info, GameAccount>,
    token_program: AccountInfo<'info>,
    vault: AccountInfo<'info>,
    recipient: AccountInfo<'info>,
    fee_recipient: AccountInfo<'info>,
    payout: u64,
    fee: u64,
) -> Result<()> {
    let seeds: &[&[u8]] = &[b"game", game.game_id.as_ref(), &[game.bump]];
    let signer_seeds = &[seeds];

    token::transfer(
        CpiContext::new_with_signer(
            token_program.clone(),
            Transfer {
                from: vault.clone(),
                to: recipient,
                authority: game.to_account_info(),
            },
            signer_seeds,
        ),
        payout,
    )?;

    if fee > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                token_program,
                Transfer {
                    from: vault,
                    to: fee_recipient,
                    authority: game.to_account_info(),
                },
                signer_seeds,
            ),
            fee,
        )?;
    }

    Ok(())
}

/// Deterministic id for an x402 payment, used for off-chain reconciliation.
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
pub enum GameState {
    Open,
    Settled,
    Cancelled,
}

#[account]
pub struct GameAccount {
    pub game_id: [u8; 32],
    pub settler: Pubkey,
    pub mint: Pubkey,
    pub fee_account: Pubkey,
    pub stake: u64,
    pub pot: u64,
    pub max_players: u16,
    pub player_count: u16,
    pub fee_bps: u16,
    pub state: GameState,
    pub bump: u8,
}

impl GameAccount {
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 32 + 8 + 8 + 2 + 2 + 2 + 1 + 1;
}

#[account]
pub struct PlayerEntry {
    pub game: Pubkey,
    pub player: Pubkey,
    pub amount: u64,
    pub refunded: bool,
    pub bump: u8,
}

impl PlayerEntry {
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 1 + 1;
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
#[instruction(game_id: [u8; 32])]
pub struct CreateGame<'info> {
    #[account(
        init,
        payer = creator,
        space = GameAccount::SIZE,
        seeds = [b"game", game_id.as_ref()],
        bump
    )]
    pub game: Account<'info, GameAccount>,
    #[account(mut)]
    pub creator: Signer<'info>,
    /// CHECK: settler/oracle pubkey authorized to declare the winner, not signing
    pub settler: AccountInfo<'info>,
    /// CHECK: token mint of the staked asset
    pub mint: AccountInfo<'info>,
    /// CHECK: token account that receives the platform rake on settle
    pub fee_account: AccountInfo<'info>,
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
pub struct Join<'info> {
    #[account(mut)]
    pub game: Account<'info, GameAccount>,
    #[account(
        init,
        payer = player,
        space = PlayerEntry::SIZE,
        seeds = [b"player", game.key().as_ref(), player.key().as_ref()],
        bump
    )]
    pub player_entry: Account<'info, PlayerEntry>,
    #[account(
        mut,
        seeds = [b"nonce", payload.payer.as_ref()],
        bump = nonce_tracker.bump,
    )]
    pub nonce_tracker: Account<'info, NonceTracker>,
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(mut, constraint = player_token.owner == player.key())]
    pub player_token: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = vault.owner == game.key() @ GameError::InvalidVault,
        constraint = vault.mint == game.mint @ GameError::InvalidVault,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(mut)]
    pub game: Account<'info, GameAccount>,
    pub settler: Signer<'info>,
    #[account(
        seeds = [b"player", game.key().as_ref(), winner_entry.player.as_ref()],
        bump = winner_entry.bump,
        constraint = winner_entry.game == game.key() @ GameError::Unauthorized,
    )]
    pub winner_entry: Account<'info, PlayerEntry>,
    #[account(mut, constraint = winner_token.owner == winner_entry.player @ GameError::Unauthorized)]
    pub winner_token: Account<'info, TokenAccount>,
    #[account(mut, constraint = fee_token.key() == game.fee_account @ GameError::InvalidFeeAccount)]
    pub fee_token: Account<'info, TokenAccount>,
    #[account(mut, constraint = vault.owner == game.key() @ GameError::InvalidVault)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(mut)]
    pub game: Account<'info, GameAccount>,
    pub settler: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimRefund<'info> {
    pub game: Account<'info, GameAccount>,
    #[account(
        mut,
        seeds = [b"player", game.key().as_ref(), player.key().as_ref()],
        bump = player_entry.bump,
    )]
    pub player_entry: Account<'info, PlayerEntry>,
    pub player: Signer<'info>,
    #[account(mut, constraint = player_token.owner == player.key())]
    pub player_token: Account<'info, TokenAccount>,
    #[account(mut, constraint = vault.owner == game.key() @ GameError::InvalidVault)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

// --- Events ---

#[event]
pub struct GameCreated {
    pub game: Pubkey,
    pub settler: Pubkey,
    pub stake: u64,
    pub max_players: u16,
}

#[event]
pub struct PlayerJoined {
    pub game: Pubkey,
    pub player: Pubkey,
    pub amount: u64,
    pub payment_id: [u8; 32],
    pub pot: u64,
}

#[event]
pub struct GameSettled {
    pub game: Pubkey,
    pub winner: Pubkey,
    pub payout: u64,
    pub fee: u64,
}

#[event]
pub struct GameCancelled {
    pub game: Pubkey,
}

#[event]
pub struct PlayerRefunded {
    pub game: Pubkey,
    pub player: Pubkey,
    pub amount: u64,
}

// --- Errors ---

#[error_code]
pub enum GameError {
    #[msg("Invalid game state for this operation")]
    InvalidState,
    #[msg("Unauthorized caller")]
    Unauthorized,
    #[msg("Stake amount must match the game buy-in")]
    InvalidAmount,
    #[msg("Player count must be between 2 and the cap")]
    InvalidPlayerCount,
    #[msg("Fee basis points must be below 10000")]
    InvalidFee,
    #[msg("Fee token account does not match the game fee account")]
    InvalidFeeAccount,
    #[msg("Vault does not belong to this game")]
    InvalidVault,
    #[msg("Game is full")]
    GameFull,
    #[msg("At least two players are required to settle")]
    NotEnoughPlayers,
    #[msg("Payment has expired")]
    Expired,
    #[msg("Nonce already used")]
    NonceUsed,
    #[msg("Stake already refunded")]
    AlreadyRefunded,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
