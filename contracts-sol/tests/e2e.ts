// End-to-end scenarios that drive a full lifecycle across the custody +
// settlement programs and assert global fund conservation: every lamport that
// enters a vault leaves it exactly once (to a winner/provider/client/refund or
// the fee account), the vault token account ends fully drained, and
// `disbursed == deposited`.
import { assert } from "chai";
import {
  escrowProgram,
  jobProgram,
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
  jobPda,
  gamePda,
  playerPda,
  vaultAuthorityPda,
  payload,
  id32,
  BN,
  Keypair,
  PublicKey,
  SystemProgram,
  TOKEN_PROGRAM_ID,
} from "./setup";

describe("e2e — fund conservation across the full lifecycle", () => {
  let mint: PublicKey;
  let feeAccount: PublicKey;

  before(async () => {
    mint = await newMint();
    feeAccount = await ata(mint, payer.publicKey);
  });

  async function vaultState(vault: PublicKey) {
    const acc = await escrowProgram.account.vault.fetch(vault);
    return { deposited: acc.deposited.toNumber(), disbursed: acc.disbursed.toNumber() };
  }

  it("poker: 3 players buy in, winner takes the pot minus rake, vault drained", async () => {
    const STAKE = 1000;
    const FEE_BPS = 300; // 3%
    const players = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
    const settler = Keypair.generate();
    await fundSol(settler.publicKey);

    const { vault, vaultToken } = await createVault(pokerProgram.programId, mint, feeAccount, "e2e-poker");
    const gameId = id32("e2e-poker");
    const game = gamePda(gameId);

    await pokerProgram.methods
      .createGame(gameId, settler.publicKey, new BN(STAKE), 4, FEE_BPS)
      .accounts({ game, creator: payer.publicKey, vault, systemProgram: SystemProgram.programId })
      .rpc();

    for (const p of players) {
      await fundSol(p.publicKey);
      const pToken = await fundTokens(mint, p.publicKey, STAKE);
      await initNonce(p);
      await pokerProgram.methods
        .join(payload(p.publicKey, STAKE, 1))
        .accounts({
          game,
          playerEntry: playerPda(game, p.publicKey),
          vault,
          nonceTracker: noncePda(p.publicKey),
          player: p.publicKey,
          playerToken: pToken,
          vaultToken,
          tokenProgram: TOKEN_PROGRAM_ID,
          escrowProgram: escrowProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([p])
        .rpc();
    }

    const pot = STAKE * players.length;
    assert.equal(Number(await tokenBalance(vaultToken)), pot);
    assert.equal((await vaultState(vault)).deposited, pot);

    const winner = players[0];
    const winnerToken = await ata(mint, winner.publicKey);
    const winnerBefore = await tokenBalance(winnerToken);
    const feeBefore = await tokenBalance(feeAccount);

    await pokerProgram.methods
      .settle()
      .accounts({
        game,
        settler: settler.publicKey,
        winnerEntry: playerPda(game, winner.publicKey),
        vault,
        vaultAuthority: vaultAuthorityPda(pokerProgram.programId),
        vaultToken,
        winnerToken,
        feeToken: feeAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        escrowProgram: escrowProgram.programId,
      })
      .signers([settler])
      .rpc();

    const fee = Math.floor((pot * FEE_BPS) / 10000);
    const winnerDelta = Number((await tokenBalance(winnerToken)) - winnerBefore);
    const feeDelta = Number((await tokenBalance(feeAccount)) - feeBefore);

    // Conservation: everything in == everything out.
    assert.equal(winnerDelta + feeDelta, pot, "payout + fee must equal the pot");
    assert.equal(Number(await tokenBalance(vaultToken)), 0, "vault fully drained");
    const st = await vaultState(vault);
    assert.equal(st.disbursed, st.deposited, "disbursed == deposited");
  });

  it("job: fund -> deliver -> approve pays provider + fee == deposit, vault drained", async () => {
    const FUND = 5000;
    const FEE_BPS = 250;
    const client = Keypair.generate();
    const providerKp = Keypair.generate();
    const controller = Keypair.generate();
    await fundSol(client.publicKey);

    const { vault, vaultToken } = await createVault(jobProgram.programId, mint, feeAccount, "e2e-job");
    const jobId = id32("e2e-job");
    const job = jobPda(jobId);

    await jobProgram.methods
      .createJob(jobId, providerKp.publicKey, controller.publicKey, FEE_BPS)
      .accounts({ job, client: client.publicKey, vault, systemProgram: SystemProgram.programId })
      .signers([client])
      .rpc();

    const clientToken = await fundTokens(mint, client.publicKey, FUND);
    await initNonce(client);
    await jobProgram.methods
      .fund(payload(client.publicKey, FUND, 1))
      .accounts({
        job,
        vault,
        nonceTracker: noncePda(client.publicKey),
        client: client.publicKey,
        clientToken,
        vaultToken,
        tokenProgram: TOKEN_PROGRAM_ID,
        escrowProgram: escrowProgram.programId,
      })
      .signers([client])
      .rpc();

    await jobProgram.methods.markDelivered().accounts({ job, actor: providerKp.publicKey }).signers([providerKp]).rpc();

    const providerToken = await ata(mint, providerKp.publicKey);
    const provBefore = await tokenBalance(providerToken);
    const feeBefore = await tokenBalance(feeAccount);

    await jobProgram.methods
      .approve()
      .accounts({
        job,
        actor: client.publicKey,
        vault,
        vaultAuthority: vaultAuthorityPda(jobProgram.programId),
        vaultToken,
        recipientToken: providerToken,
        feeToken: feeAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        escrowProgram: escrowProgram.programId,
      })
      .signers([client])
      .rpc();

    const provDelta = Number((await tokenBalance(providerToken)) - provBefore);
    const feeDelta = Number((await tokenBalance(feeAccount)) - feeBefore);
    assert.equal(provDelta + feeDelta, FUND, "provider + fee must equal the deposit");
    assert.equal(Number(await tokenBalance(vaultToken)), 0, "vault fully drained");
  });

  it("poker cancel: every player is refunded their exact stake, vault drained", async () => {
    const STAKE = 1500;
    const players = [Keypair.generate(), Keypair.generate()];
    const settler = Keypair.generate();
    await fundSol(settler.publicKey);

    const { vault, vaultToken } = await createVault(pokerProgram.programId, mint, feeAccount, "e2e-poker-cancel");
    const gameId = id32("e2e-poker-cancel");
    const game = gamePda(gameId);

    await pokerProgram.methods
      .createGame(gameId, settler.publicKey, new BN(STAKE), 4, 500)
      .accounts({ game, creator: payer.publicKey, vault, systemProgram: SystemProgram.programId })
      .rpc();

    for (const p of players) {
      await fundSol(p.publicKey);
      const pToken = await fundTokens(mint, p.publicKey, STAKE);
      await initNonce(p);
      await pokerProgram.methods
        .join(payload(p.publicKey, STAKE, 1))
        .accounts({
          game,
          playerEntry: playerPda(game, p.publicKey),
          vault,
          nonceTracker: noncePda(p.publicKey),
          player: p.publicKey,
          playerToken: pToken,
          vaultToken,
          tokenProgram: TOKEN_PROGRAM_ID,
          escrowProgram: escrowProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([p])
        .rpc();
    }

    await pokerProgram.methods.cancel().accounts({ game, settler: settler.publicKey }).signers([settler]).rpc();

    for (const p of players) {
      const pToken = await ata(mint, p.publicKey);
      const before = await tokenBalance(pToken);
      await pokerProgram.methods
        .claimRefund()
        .accounts({
          game,
          playerEntry: playerPda(game, p.publicKey),
          player: p.publicKey,
          vault,
          vaultAuthority: vaultAuthorityPda(pokerProgram.programId),
          vaultToken,
          playerToken: pToken,
          feeToken: feeAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          escrowProgram: escrowProgram.programId,
        })
        .signers([p])
        .rpc();
      assert.equal(Number((await tokenBalance(pToken)) - before), STAKE, "exact stake refunded");
    }

    assert.equal(Number(await tokenBalance(vaultToken)), 0, "vault fully drained after refunds");
  });
});
