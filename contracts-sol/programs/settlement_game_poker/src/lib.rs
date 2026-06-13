use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};
use escrow::cpi::accounts::Disburse;
use escrow::program::Escrow;
use escrow::{Vault, VAULT_AUTHORITY_SEED};

pub mod math;

declare_id!("CATBJS1qmZCCHJzNmdEwXNsBn1QYJoBuCg7yi8FTL8mG");

pub const BPS_DENOMINATOR: u64 = 10_000;
pub const MAX_PLAYERS_CAP: u16 = 64;

/// settlement_game_poker is the winner-take-all policy layer for poker (and
/// similar pooled-pot games). Game *logic* (cards, betting, showdown) runs
/// off-chain on the backend; this program only settles. N players stake a fixed
/// buy-in into the bound escrow vault via x402 `join`, a designated server
/// `settler` declares the winner, and the pot (minus rake) is released to the
/// winner through `escrow::disburse`. Funds always live in escrow custody.
#[program]
pub mod settlement_game_poker {
    use super::*;

    /// Register a game against an escrow vault already bound to this program.
    pub fn create_game(
        ctx: Context<CreateGame>,
        game_id: [u8; 32],
        settler: Pubkey,
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
        require!(
            ctx.accounts.vault.settlement_program == crate::ID,
            GameError::VaultNotBound
        );

        let game = &mut ctx.accounts.game;
        game.game_id = game_id;
        game.settler = settler;
        game.vault = ctx.accounts.vault.key();
        game.stake = stake;
        game.max_players = max_players;
        game.fee_bps = fee_bps;
        game.player_count = 0;
        game.state = GameState::Open;
        game.bump = ctx.bumps.game;

        emit!(GameCreated {
            game: game.key(),
            game_id,
            settler,
            vault: game.vault,
            stake,
        });
        Ok(())
    }

    /// x402 buy-in: deposit the stake into the escrow vault (wrapped via CPI)
    /// and record the player's entry.
    pub fn join(ctx: Context<Join>, payload: escrow::PaymentPayload) -> Result<()> {
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

        escrow::cpi::deposit(
            CpiContext::new(
                ctx.accounts.escrow_program.to_account_info(),
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

        let game = &mut ctx.accounts.game;
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
            player_count: game.player_count,
        });
        Ok(())
    }

    /// Server settler declares the winner; the whole pot (vault balance) minus
    /// the rake is released to the winner. The winner must have an entry.
    pub fn settle(ctx: Context<SettleGame>) -> Result<()> {
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
        require!(
            ctx.accounts.winner_entry.game == ctx.accounts.game.key(),
            GameError::Unauthorized
        );
        require!(
            ctx.accounts.winner_token.owner == ctx.accounts.winner_entry.player,
            GameError::Unauthorized
        );

        let pot = available(&ctx.accounts.vault)?;
        let (payout, fee) =
            math::pot_split(pot, ctx.accounts.game.fee_bps).ok_or(GameError::MathOverflow)?;

        disburse_signed(
            &ctx.accounts.escrow_program,
            &ctx.accounts.vault,
            &ctx.accounts.vault_authority,
            &ctx.accounts.vault_token,
            &ctx.accounts.winner_token,
            &ctx.accounts.fee_token,
            &ctx.accounts.token_program,
            ctx.bumps.vault_authority,
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

    /// Settler aborts an open game; players reclaim stakes via claim_refund.
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
        require!(
            ctx.accounts.player_token.owner == ctx.accounts.player_entry.player,
            GameError::Unauthorized
        );

        let amount = ctx.accounts.player_entry.amount;
        disburse_signed(
            &ctx.accounts.escrow_program,
            &ctx.accounts.vault,
            &ctx.accounts.vault_authority,
            &ctx.accounts.vault_token,
            &ctx.accounts.player_token,
            &ctx.accounts.player_token,
            &ctx.accounts.token_program,
            ctx.bumps.vault_authority,
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

fn available(vault: &Account<Vault>) -> Result<u64> {
    vault
        .deposited
        .checked_sub(vault.disbursed)
        .ok_or(GameError::MathOverflow.into())
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
            escrow_program.to_account_info(),
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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum GameState {
    Open,
    Settled,
    Cancelled,
}

#[account]
pub struct Game {
    pub game_id: [u8; 32],
    pub settler: Pubkey,
    pub vault: Pubkey,
    pub stake: u64,
    pub max_players: u16,
    pub player_count: u16,
    pub fee_bps: u16,
    pub state: GameState,
    pub bump: u8,
}

impl Game {
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 8 + 2 + 2 + 2 + 1 + 1;
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

// --- Contexts ---

#[derive(Accounts)]
#[instruction(game_id: [u8; 32])]
pub struct CreateGame<'info> {
    #[account(
        init,
        payer = creator,
        space = Game::SIZE,
        seeds = [b"game", game_id.as_ref()],
        bump
    )]
    pub game: Account<'info, Game>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(payload: escrow::PaymentPayload)]
pub struct Join<'info> {
    #[account(mut, constraint = game.vault == vault.key() @ GameError::VaultMismatch)]
    pub game: Account<'info, Game>,
    #[account(
        init,
        payer = player,
        space = PlayerEntry::SIZE,
        seeds = [b"player", game.key().as_ref(), player.key().as_ref()],
        bump
    )]
    pub player_entry: Account<'info, PlayerEntry>,
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    /// CHECK: escrow nonce tracker PDA, validated inside escrow::deposit
    #[account(mut)]
    pub nonce_tracker: UncheckedAccount<'info>,
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(mut)]
    pub player_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub escrow_program: Program<'info, Escrow>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleGame<'info> {
    #[account(mut, constraint = game.vault == vault.key() @ GameError::VaultMismatch)]
    pub game: Account<'info, Game>,
    pub settler: Signer<'info>,
    pub winner_entry: Account<'info, PlayerEntry>,
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    /// CHECK: PDA that authorizes disbursement; signs the escrow CPI via seeds
    #[account(seeds = [VAULT_AUTHORITY_SEED], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub vault_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub winner_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub fee_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub escrow_program: Program<'info, Escrow>,
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(mut)]
    pub game: Account<'info, Game>,
    pub settler: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimRefund<'info> {
    #[account(constraint = game.vault == vault.key() @ GameError::VaultMismatch)]
    pub game: Account<'info, Game>,
    #[account(
        mut,
        seeds = [b"player", game.key().as_ref(), player.key().as_ref()],
        bump = player_entry.bump,
    )]
    pub player_entry: Account<'info, PlayerEntry>,
    pub player: Signer<'info>,
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    /// CHECK: PDA that authorizes disbursement; signs the escrow CPI via seeds
    #[account(seeds = [VAULT_AUTHORITY_SEED], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub vault_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub player_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub escrow_program: Program<'info, Escrow>,
}

// --- Events ---

#[event]
pub struct GameCreated {
    pub game: Pubkey,
    pub game_id: [u8; 32],
    pub settler: Pubkey,
    pub vault: Pubkey,
    pub stake: u64,
}

#[event]
pub struct PlayerJoined {
    pub game: Pubkey,
    pub player: Pubkey,
    pub amount: u64,
    pub player_count: u16,
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
    #[msg("Vault is not bound to this settlement program")]
    VaultNotBound,
    #[msg("Vault does not match the game")]
    VaultMismatch,
    #[msg("Game is full")]
    GameFull,
    #[msg("At least two players are required to settle")]
    NotEnoughPlayers,
    #[msg("Stake already refunded")]
    AlreadyRefunded,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
