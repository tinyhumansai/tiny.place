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

  async function newGame(label: string) {
    const { vault, vaultToken } = await createVault(pokerProgram.programId, mint, feeAccount, label);
    const gameId = id32(label);
    const game = gamePda(gameId);
    await pokerProgram.methods
      .createGame(gameId, settler.publicKey, new BN(STAKE), MAX_PLAYERS, FEE_BPS)
      .accounts({ game, creator: payer.publicKey, vault, systemProgram: SystemProgram.programId })
      .signers([])
      .rpc();
    return { vault, vaultToken, game, gameId };
  }

  async function join(game: PublicKey, vault: PublicKey, vaultToken: PublicKey, player: Keypair, nonce: number) {
    await fundSol(player.publicKey);
    const playerToken = await fundTokens(mint, player.publicKey, STAKE);
    await initNonce(player);
    await pokerProgram.methods
      .join(payload(player.publicKey, STAKE, nonce))
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
  }

  it("two players join and the settler awards the pot minus rake", async () => {
    const { vault, vaultToken, game } = await newGame("poker-happy");
    const p1 = Keypair.generate();
    const p2 = Keypair.generate();
    await join(game, vault, vaultToken, p1, 1);
    await join(game, vault, vaultToken, p2, 1);

    assert.equal((await pokerProgram.account.game.fetch(game)).playerCount, 2);
    assert.equal(await tokenBalance(vaultToken), BigInt(2 * STAKE));

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
  });

  it("cancel + claim_refund returns each player's stake", async () => {
    const { vault, vaultToken, game } = await newGame("poker-cancel");
    const p1 = Keypair.generate();
    const p2 = Keypair.generate();
    await join(game, vault, vaultToken, p1, 1);
    await join(game, vault, vaultToken, p2, 1);

    await pokerProgram.methods.cancel().accounts({ game, settler: settler.publicKey }).signers([settler]).rpc();

    for (const p of [p1, p2]) {
      const before = await tokenBalance(await ata(mint, p.publicKey));
      await pokerProgram.methods
        .claimRefund()
        .accounts({
          game,
          playerEntry: playerPda(game, p.publicKey),
          player: p.publicKey,
          vault,
          vaultAuthority: vaultAuthority(),
          vaultToken,
          playerToken: await ata(mint, p.publicKey),
          tokenProgram: TOKEN_PROGRAM_ID,
          escrowProgram: escrowProgram.programId,
        })
        .signers([p])
        .rpc();
      assert.equal((await tokenBalance(await ata(mint, p.publicKey))) - before, BigInt(STAKE));
    }
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
  });
});
