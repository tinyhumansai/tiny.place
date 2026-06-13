use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};
use escrow::cpi::accounts::Disburse;
use escrow::program::Escrow;
use escrow::{Vault, VAULT_AUTHORITY_SEED};

pub mod math;

declare_id!("Ah7UYiQHzQ3T8D5PZpfbYttSras4t5dQyxevuEL1rHaY");

/// Basis-points denominator: a `fee_bps` of 500 means a 5.00% rake.
pub const BPS_DENOMINATOR: u64 = 10_000;
/// Upper bound on players in a single pot; keeps account/transaction sizing bounded.
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
            &ctx.accounts.fee_token,
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

/// The vault's current pot: total deposited minus anything already disbursed.
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

/// Game lifecycle:
///
/// ```text
///                 join × N            settle (settler picks winner)
///   Open ───────────────────────────────────────────────► Settled (→ winner)
///    │
///    │ cancel (settler)
///    ▼
///  Cancelled ── claim_refund × N ──► (each player reclaims their stake)
/// ```
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum GameState {
    /// Accepting buy-ins; settleable once ≥ 2 players have joined.
    Open,
    /// Terminal: the settler awarded the pot to a winner.
    Settled,
    /// Terminal-ish: aborted; players reclaim stakes via `claim_refund`.
    Cancelled,
}

/// On-chain record of a pooled, winner-take-all game. Funds live in the bound
/// escrow vault; this account tracks the buy-in, player count, and rake.
/// PDA: `["game", game_id]`.
#[account]
pub struct Game {
    /// Caller-supplied 32-byte id; also the PDA seed.
    pub game_id: [u8; 32],
    /// Server key authorized to declare the winner (`settle`) or `cancel`.
    pub settler: Pubkey,
    /// The escrow vault holding the pot.
    pub vault: Pubkey,
    /// Required buy-in per player, in token base units.
    pub stake: u64,
    /// Maximum players allowed to join (2..=MAX_PLAYERS_CAP).
    pub max_players: u16,
    /// Number of players that have joined so far.
    pub player_count: u16,
    /// Platform rake in basis points, taken from the pot on settle.
    pub fee_bps: u16,
    /// Lifecycle state.
    pub state: GameState,
    /// Cached PDA bump for `["game", game_id]`.
    pub bump: u8,
}

impl Game {
    /// 8 discriminator + game_id(32) + settler(32) + vault(32) + stake(8) +
    /// max_players(2) + player_count(2) + fee_bps(2) + state(1) + bump(1).
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 8 + 2 + 2 + 2 + 1 + 1;
}

/// Proof that a player joined a game with a given stake; also the unit of
/// refund. One per (game, player). PDA: `["player", game, player]`.
#[account]
pub struct PlayerEntry {
    /// The game this entry belongs to.
    pub game: Pubkey,
    /// The player who staked.
    pub player: Pubkey,
    /// The stake they put in (equals the game's buy-in).
    pub amount: u64,
    /// Whether this stake has already been refunded (cancel path).
    pub refunded: bool,
    /// Cached PDA bump.
    pub bump: u8,
}

impl PlayerEntry {
    /// 8 discriminator + game(32) + player(32) + amount(8) + refunded(1) +
    /// bump(1).
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 1 + 1;
}

// --- Contexts ---

/// Accounts for [`settlement_game_poker::create_game`]. The vault must already
/// exist and be bound to this program.
#[derive(Accounts)]
#[instruction(game_id: [u8; 32])]
pub struct CreateGame<'info> {
    /// The game record being created; PDA `["game", game_id]`.
    #[account(
        init,
        payer = creator,
        space = Game::SIZE,
        seeds = [b"game", game_id.as_ref()],
        bump
    )]
    pub game: Account<'info, Game>,
    /// Pays rent for the game account (typically the room host / backend).
    #[account(mut)]
    pub creator: Signer<'info>,
    /// The escrow vault that custodies the pot; checked to be bound to this
    /// program.
    pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}

/// Accounts for [`settlement_game_poker::join`]. Creates the player's entry and
/// CPIs `escrow::deposit` for the buy-in.
#[derive(Accounts)]
#[instruction(payload: escrow::PaymentPayload)]
pub struct Join<'info> {
    /// The game being joined; must point at `vault`. `player_count` is bumped.
    #[account(mut, constraint = game.vault == vault.key() @ GameError::VaultMismatch)]
    pub game: Account<'info, Game>,
    /// The new per-player entry; PDA `["player", game, player]`. Its `init`
    /// also prevents the same player from joining twice.
    #[account(
        init,
        payer = player,
        space = PlayerEntry::SIZE,
        seeds = [b"player", game.key().as_ref(), player.key().as_ref()],
        bump
    )]
    pub player_entry: Account<'info, PlayerEntry>,
    /// The escrow vault (mutated by the CPI deposit).
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    /// CHECK: escrow nonce tracker PDA for the player; validated inside
    /// `escrow::deposit`.
    #[account(mut)]
    pub nonce_tracker: UncheckedAccount<'info>,
    /// The joining player; the deposit's payer.
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

/// Accounts for [`settlement_game_poker::settle`]. Releases the pot to the
/// winner minus rake via `escrow::disburse`.
#[derive(Accounts)]
pub struct SettleGame<'info> {
    /// The game being settled; must point at `vault`.
    #[account(mut, constraint = game.vault == vault.key() @ GameError::VaultMismatch)]
    pub game: Account<'info, Game>,
    /// Must equal `game.settler`.
    pub settler: Signer<'info>,
    /// The winner's entry — proves they joined this game; its `player` is paid.
    pub winner_entry: Account<'info, PlayerEntry>,
    /// The escrow vault being drained.
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    /// CHECK: this program's `vault_authority` PDA; signs the escrow CPI.
    #[account(seeds = [VAULT_AUTHORITY_SEED], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    /// The vault's pinned token account (disburse source).
    #[account(mut)]
    pub vault_token: Account<'info, TokenAccount>,
    /// The winner's token account; must be owned by `winner_entry.player`.
    #[account(mut)]
    pub winner_token: Account<'info, TokenAccount>,
    /// Fee destination; escrow verifies it equals `vault.fee_account`.
    #[account(mut)]
    pub fee_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    /// The escrow program, invoked via CPI.
    pub escrow_program: Program<'info, Escrow>,
}

/// Accounts for [`settlement_game_poker::cancel`]. Settler-only state change.
#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(mut)]
    pub game: Account<'info, Game>,
    /// Must equal `game.settler`.
    pub settler: Signer<'info>,
}

/// Accounts for [`settlement_game_poker::claim_refund`]. A player reclaims their
/// stake from a cancelled game via `escrow::disburse`.
#[derive(Accounts)]
pub struct ClaimRefund<'info> {
    /// The cancelled game; must point at `vault`.
    #[account(constraint = game.vault == vault.key() @ GameError::VaultMismatch)]
    pub game: Account<'info, Game>,
    /// The caller's entry; marked refunded after payout.
    #[account(
        mut,
        seeds = [b"player", game.key().as_ref(), player.key().as_ref()],
        bump = player_entry.bump,
    )]
    pub player_entry: Account<'info, PlayerEntry>,
    /// The player reclaiming their stake.
    pub player: Signer<'info>,
    /// The escrow vault being drained.
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    /// CHECK: this program's `vault_authority` PDA; signs the escrow CPI.
    #[account(seeds = [VAULT_AUTHORITY_SEED], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    /// The vault's pinned token account (disburse source).
    #[account(mut)]
    pub vault_token: Account<'info, TokenAccount>,
    /// The player's token account; must be owned by `player_entry.player`.
    #[account(mut)]
    pub player_token: Account<'info, TokenAccount>,
    /// The vault's fee account — required by `escrow::disburse` even though a
    /// refund withholds zero fee. Must differ from `player_token` (Anchor
    /// forbids duplicate mutable accounts).
    #[account(mut)]
    pub fee_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    /// The escrow program, invoked via CPI.
    pub escrow_program: Program<'info, Escrow>,
}

// --- Events ---

/// Emitted when a game is created and bound to a vault.
#[event]
pub struct GameCreated {
    pub game: Pubkey,
    pub game_id: [u8; 32],
    pub settler: Pubkey,
    pub vault: Pubkey,
    pub stake: u64,
}

/// Emitted on each buy-in; carries the running `player_count`.
#[event]
pub struct PlayerJoined {
    pub game: Pubkey,
    pub player: Pubkey,
    pub amount: u64,
    pub player_count: u16,
}

/// Emitted when the settler awards the pot; `payout` to `winner`, `fee` to the
/// fee account.
#[event]
pub struct GameSettled {
    pub game: Pubkey,
    pub winner: Pubkey,
    pub payout: u64,
    pub fee: u64,
}

/// Emitted when the settler cancels an open game.
#[event]
pub struct GameCancelled {
    pub game: Pubkey,
}

/// Emitted when a player reclaims their stake from a cancelled game.
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
