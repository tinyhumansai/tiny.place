import { assert } from "chai";
import {
  escrowProgram,
  jobProgram,
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
  vaultAuthorityPda,
  payload,
  id32,
  expectRevert,
  Keypair,
  PublicKey,
  SystemProgram,
  TOKEN_PROGRAM_ID,
} from "./setup";

const FEE_BPS = 250; // 2.5%
const FUND = 1000;

describe("settlement_job", () => {
  let mint: PublicKey;
  let feeAccount: PublicKey;
  const vaultAuthority = () => vaultAuthorityPda(jobProgram.programId);

  before(async () => {
    mint = await newMint();
    feeAccount = await ata(mint, payer.publicKey);
  });

  // Create a bound vault + job, fund it from `client`. Returns the handles.
  async function setupJob(label: string, client: Keypair, provider: PublicKey, controller: PublicKey) {
    const { vault, vaultToken } = await createVault(jobProgram.programId, mint, feeAccount, label);
    const jobId = id32(label);
    const job = jobPda(jobId);

    await jobProgram.methods
      .createJob(jobId, provider, controller, FEE_BPS)
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

    assert.equal((await escrowProgram.account.vault.fetch(vault)).deposited.toNumber(), FUND);
    return { vault, vaultToken, job, jobId };
  }

  it("happy path: deliver -> approve releases to provider minus rake", async () => {
    const client = Keypair.generate();
    const providerKp = Keypair.generate();
    const controller = Keypair.generate();
    await fundSol(client.publicKey);
    await fundSol(providerKp.publicKey);
    const providerToken = await ata(mint, providerKp.publicKey);
    const feeBefore = await tokenBalance(feeAccount);

    const { vault, vaultToken, job } = await setupJob("job-happy", client, providerKp.publicKey, controller.publicKey);

    await jobProgram.methods
      .markDelivered()
      .accounts({ job, actor: providerKp.publicKey })
      .signers([providerKp])
      .rpc();

    await jobProgram.methods
      .approve()
      .accounts({
        job,
        actor: client.publicKey,
        vault,
        vaultAuthority: vaultAuthority(),
        vaultToken,
        recipientToken: providerToken,
        feeToken: feeAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        escrowProgram: escrowProgram.programId,
      })
      .signers([client])
      .rpc();

    const fee = Math.floor((FUND * FEE_BPS) / 10000); // 25
    assert.equal(await tokenBalance(providerToken), BigInt(FUND - fee));
    assert.equal((await tokenBalance(feeAccount)) - feeBefore, BigInt(fee));
    const acc = await escrowProgram.account.vault.fetch(vault);
    assert.equal(acc.disbursed.toNumber(), FUND);
  });

  it("dispute -> controller resolves to client (refund, no rake)", async () => {
    const client = Keypair.generate();
    const providerKp = Keypair.generate();
    const controller = Keypair.generate();
    await fundSol(client.publicKey);
    await fundSol(controller.publicKey);
    const clientToken = await ata(mint, client.publicKey);

    const { vault, vaultToken, job } = await setupJob("job-dispute", client, providerKp.publicKey, controller.publicKey);
    const clientBefore = await tokenBalance(clientToken);

    await jobProgram.methods.markDelivered().accounts({ job, actor: providerKp.publicKey }).signers([providerKp]).rpc();
    await jobProgram.methods.dispute().accounts({ job, actor: client.publicKey }).signers([client]).rpc();

    await jobProgram.methods
      .resolve(false) // award_provider = false -> client
      .accounts({
        job,
        actor: controller.publicKey,
        vault,
        vaultAuthority: vaultAuthority(),
        vaultToken,
        recipientToken: clientToken,
        feeToken: feeAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        escrowProgram: escrowProgram.programId,
      })
      .signers([controller])
      .rpc();

    assert.equal((await tokenBalance(clientToken)) - clientBefore, BigInt(FUND)); // full refund, no fee
  });

  it("refund while Open returns funds to client", async () => {
    const client = Keypair.generate();
    const providerKp = Keypair.generate();
    const controller = Keypair.generate();
    await fundSol(client.publicKey);
    const clientToken = await ata(mint, client.publicKey);

    const { vault, vaultToken, job } = await setupJob("job-refund", client, providerKp.publicKey, controller.publicKey);
    const before = await tokenBalance(clientToken);

    await jobProgram.methods
      .refund()
      .accounts({
        job,
        actor: client.publicKey,
        vault,
        vaultAuthority: vaultAuthority(),
        vaultToken,
        recipientToken: clientToken,
        feeToken: feeAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        escrowProgram: escrowProgram.programId,
      })
      .signers([client])
      .rpc();

    assert.equal((await tokenBalance(clientToken)) - before, BigInt(FUND));
  });

  it("rejects unauthorized actors", async () => {
    const client = Keypair.generate();
    const providerKp = Keypair.generate();
    const controller = Keypair.generate();
    const stranger = Keypair.generate();
    await fundSol(client.publicKey);
    await fundSol(stranger.publicKey);
    const providerToken = await ata(mint, providerKp.publicKey);

    const { vault, vaultToken, job } = await setupJob("job-authz", client, providerKp.publicKey, controller.publicKey);

    // Non-provider cannot mark delivered.
    await expectRevert(
      jobProgram.methods.markDelivered().accounts({ job, actor: stranger.publicKey }).signers([stranger]).rpc(),
      "non-provider deliver",
    );

    // Cannot approve before delivery.
    await expectRevert(
      jobProgram.methods
        .approve()
        .accounts({
          job,
          actor: client.publicKey,
          vault,
          vaultAuthority: vaultAuthority(),
          vaultToken,
          recipientToken: providerToken,
          feeToken: feeAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          escrowProgram: escrowProgram.programId,
        })
        .signers([client])
        .rpc(),
      "approve before delivered",
    );

    // Deliver, then a stranger cannot resolve a (non-existent) dispute, and
    // only the controller can resolve once disputed.
    await jobProgram.methods.markDelivered().accounts({ job, actor: providerKp.publicKey }).signers([providerKp]).rpc();
    await jobProgram.methods.dispute().accounts({ job, actor: providerKp.publicKey }).signers([providerKp]).rpc();
    await expectRevert(
      jobProgram.methods
        .resolve(true)
        .accounts({
          job,
          actor: stranger.publicKey,
          vault,
          vaultAuthority: vaultAuthority(),
          vaultToken,
          recipientToken: providerToken,
          feeToken: feeAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          escrowProgram: escrowProgram.programId,
        })
        .signers([stranger])
        .rpc(),
      "non-controller resolve",
    );
  });
});
