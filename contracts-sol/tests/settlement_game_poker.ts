import { assert } from "chai";
import {
  escrowProgram,
  pokerProgram,
  payer,
  newMint,
  ata,
  fundTokens,
  fundSol,
  tokenBalance,
  createVault,
  initNonce,
  noncePda,
  gamePda,
  playerPda,
  vaultAuthorityPda,
  payload,
  id32,
  expectRevert,
  BN,
  Keypair,
  PublicKey,
  SystemProgram,
  TOKEN_PROGRAM_ID,
} from "./setup";

const STAKE = 1000;
const FEE_BPS = 500; // 5%
const MAX_PLAYERS = 4;

describe("settlement_game_poker", () => {
  let mint: PublicKey;
  let feeAccount: PublicKey;
  const settler = Keypair.generate();
  const vaultAuthority = () => vaultAuthorityPda(pokerProgram.programId);

  before(async () => {
    mint = await newMint();
    feeAccount = await ata(mint, payer.publicKey);
    await fundSol(settler.publicKey);
  });

  async function expectGameState(
    game: PublicKey,
    state: "open" | "settled" | "cancelled",
  ) {
    assert.deepEqual((await pokerProgram.account.game.fetch(game)).state, {
      [state]: {},
    });
  }

  async function newGame(label: string) {
    const { vault, vaultToken } = await createVault(pokerProgram.programId, mint, feeAccount, label);
    const gameId = id32(label);
    const game = gamePda(gameId);
    await pokerProgram.methods
      .createGame(gameId, settler.publicKey, new BN(STAKE), MAX_PLAYERS, FEE_BPS)
      .accounts({ game, creator: payer.publicKey, vault, systemProgram: SystemProgram.programId })
      .signers([])
      .rpc();
    await expectGameState(game, "open");
    return { vault, vaultToken, game, gameId };
  }

  async function join(
    game: PublicKey,
    vault: PublicKey,
    vaultToken: PublicKey,
    player: Keypair,
    nonce: number,
    amount = STAKE,
  ) {
    await fundSol(player.publicKey);
    const playerToken = await fundTokens(mint, player.publicKey, STAKE);
    await initNonce(player);
    await pokerProgram.methods
      .join(payload(player.publicKey, amount, nonce))
      .accounts({
        game,
        playerEntry: playerPda(game, player.publicKey),
        vault,
        nonceTracker: noncePda(player.publicKey),
        player: player.publicKey,
        playerToken,
        vaultToken,
        tokenProgram: TOKEN_PROGRAM_ID,
        escrowProgram: escrowProgram.programId,
        systemProgram: SystemProgram.programId,
      })
      .signers([player])
      .rpc();

    const entry = await pokerProgram.account.playerEntry.fetch(playerPda(game, player.publicKey));
    assert.equal(entry.game.toBase58(), game.toBase58());
    assert.equal(entry.player.toBase58(), player.publicKey.toBase58());
    assert.equal(entry.amount.toNumber(), amount);
    assert.equal(entry.refunded, false);
    return playerToken;
  }

  it("two players join and the settler awards the pot minus rake", async () => {
    const { vault, vaultToken, game } = await newGame("poker-happy");
    const p1 = Keypair.generate();
    const p2 = Keypair.generate();
    await join(game, vault, vaultToken, p1, 1);
    await join(game, vault, vaultToken, p2, 1);

    assert.equal((await pokerProgram.account.game.fetch(game)).playerCount, 2);
    assert.equal(await tokenBalance(vaultToken), BigInt(2 * STAKE));
    await expectGameState(game, "open");

    const winnerToken = await ata(mint, p1.publicKey);
    const feeBefore = await tokenBalance(feeAccount);

    await pokerProgram.methods
      .settle()
      .accounts({
        game,
        settler: settler.publicKey,
        winnerEntry: playerPda(game, p1.publicKey),
        vault,
        vaultAuthority: vaultAuthority(),
        vaultToken,
        winnerToken,
        feeToken: feeAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        escrowProgram: escrowProgram.programId,
      })
      .signers([settler])
      .rpc();

    const pot = 2 * STAKE;
    const fee = Math.floor((pot * FEE_BPS) / 10000); // 100
    assert.equal(await tokenBalance(winnerToken), BigInt(pot - fee));
    assert.equal((await tokenBalance(feeAccount)) - feeBefore, BigInt(fee));
    await expectGameState(game, "settled");

    const latePlayer = Keypair.generate();
    await expectRevert(join(game, vault, vaultToken, latePlayer, 1), "join after settle");
  });

  it("cancel + claim_refund returns each player's stake", async () => {
    const { vault, vaultToken, game } = await newGame("poker-cancel");
    const p1 = Keypair.generate();
    const p2 = Keypair.generate();
    await join(game, vault, vaultToken, p1, 1);
    await join(game, vault, vaultToken, p2, 1);

    await pokerProgram.methods.cancel().accounts({ game, settler: settler.publicKey }).signers([settler]).rpc();
    await expectGameState(game, "cancelled");

    await expectRevert(
      pokerProgram.methods
        .settle()
        .accounts({
          game,
          settler: settler.publicKey,
          winnerEntry: playerPda(game, p1.publicKey),
          vault,
          vaultAuthority: vaultAuthority(),
          vaultToken,
          winnerToken: await ata(mint, p1.publicKey),
          feeToken: feeAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          escrowProgram: escrowProgram.programId,
        })
        .signers([settler])
        .rpc(),
      "settle after cancel",
    );

    for (const p of [p1, p2]) {
      const playerToken = await ata(mint, p.publicKey);
      const before = await tokenBalance(playerToken);
      await pokerProgram.methods
        .claimRefund()
        .accounts({
          game,
          playerEntry: playerPda(game, p.publicKey),
          player: p.publicKey,
          vault,
          vaultAuthority: vaultAuthority(),
          vaultToken,
          playerToken,
          feeToken: feeAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          escrowProgram: escrowProgram.programId,
        })
        .signers([p])
        .rpc();
      assert.equal((await tokenBalance(playerToken)) - before, BigInt(STAKE));
      const entry = await pokerProgram.account.playerEntry.fetch(playerPda(game, p.publicKey));
      assert.equal(entry.refunded, true);
    }

    await expectRevert(
      pokerProgram.methods
        .claimRefund()
        .accounts({
          game,
          playerEntry: playerPda(game, p1.publicKey),
          player: p1.publicKey,
          vault,
          vaultAuthority: vaultAuthority(),
          vaultToken,
          playerToken: await ata(mint, p1.publicKey),
          feeToken: feeAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          escrowProgram: escrowProgram.programId,
        })
        .signers([p1])
        .rpc(),
      "double refund",
    );
  });

  it("rejects settle with < 2 players, double-join, and non-settler", async () => {
    const { vault, vaultToken, game } = await newGame("poker-guards");
    const p1 = Keypair.generate();
    await join(game, vault, vaultToken, p1, 1);

    // Only one player -> cannot settle.
    await expectRevert(
      pokerProgram.methods
        .settle()
        .accounts({
          game,
          settler: settler.publicKey,
          winnerEntry: playerPda(game, p1.publicKey),
          vault,
          vaultAuthority: vaultAuthority(),
          vaultToken,
          winnerToken: await ata(mint, p1.publicKey),
          feeToken: feeAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          escrowProgram: escrowProgram.programId,
        })
        .signers([settler])
        .rpc(),
      "settle with one player",
    );

    // Same player joining twice -> PlayerEntry already initialized.
    await expectRevert(join(game, vault, vaultToken, p1, 2), "double join");

    // Buy-in amount must exactly match the game stake.
    const shortBuyer = Keypair.generate();
    await expectRevert(join(game, vault, vaultToken, shortBuyer, 1, STAKE - 1), "short buy-in");

    // Add a second player so the game is settleable, then a non-settler tries.
    const p2 = Keypair.generate();
    await join(game, vault, vaultToken, p2, 1);
    const stranger = Keypair.generate();
    await fundSol(stranger.publicKey);
    await expectRevert(
      pokerProgram.methods
        .settle()
        .accounts({
          game,
          settler: stranger.publicKey,
          winnerEntry: playerPda(game, p1.publicKey),
          vault,
          vaultAuthority: vaultAuthority(),
          vaultToken,
          winnerToken: await ata(mint, p1.publicKey),
          feeToken: feeAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          escrowProgram: escrowProgram.programId,
        })
        .signers([stranger])
        .rpc(),
      "non-settler settle",
    );

    // The configured table cap is enforced.
    await join(game, vault, vaultToken, Keypair.generate(), 1);
    await join(game, vault, vaultToken, Keypair.generate(), 1);
    await expectRevert(join(game, vault, vaultToken, Keypair.generate(), 1), "game full");
  });

  // Regression for the CRITICAL vault-theft finding: a pot vault is bound 1:1 to
  // one game at creation (escrow stores vault.owner = the game PDA). A third
  // party must NOT be able to register a competing game over an already-funded
  // pot vault and drain it. Before the fix, create_game only checked
  // `vault.settlement_program == crate::ID`, so this attacker createGame
  // succeeded and could then cancel + claim_refund (or settle) the victim's pot.
  // After the fix it reverts with VaultNotOwned.
  it("rejects a competing game registered against another game's pot vault", async () => {
    // Victim creates a game; escrow records vault.owner = the victim game PDA.
    const { vault, vaultToken, game } = await newGame("poker-victim-vault");
    const p1 = Keypair.generate();
    const p2 = Keypair.generate();
    await join(game, vault, vaultToken, p1, 1);
    await join(game, vault, vaultToken, p2, 1);

    // Attacker tries to register a brand-new game (different game_id, different
    // PDA) over the victim's funded pot vault — must revert with VaultNotOwned.
    const attacker = Keypair.generate();
    await fundSol(attacker.publicKey);
    const attackerGameId = id32("poker-attacker-steal");
    const attackerGame = gamePda(attackerGameId);
    await expectRevert(
      pokerProgram.methods
        .createGame(attackerGameId, attacker.publicKey, new BN(STAKE), MAX_PLAYERS, FEE_BPS)
        .accounts({ game: attackerGame, creator: attacker.publicKey, vault, systemProgram: SystemProgram.programId })
        .signers([attacker])
        .rpc(),
      "competing game over a funded pot vault",
    );
  });
});
