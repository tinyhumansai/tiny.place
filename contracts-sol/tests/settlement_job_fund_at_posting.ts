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

// Regression for the jobs-marketplace "fund at posting → bind provider at
// selection" flow (docs/spec/jobs-marketplace.md §8). It proves the EXISTING
// escrow + settlement_job programs already support this with no on-chain change:
//
//   1. create_vault(owner = future job PDA) and deposit the budget BEFORE the
//      job (and its provider) exist — the deposit only needs the vault.
//   2. create_job(provider) later; the vault.owner == job.key() check still
//      passes because owner was pinned to the deterministic job PDA.
//   3. The normal deliver → approve release then works.
//
// It also confirms the security property the deferred flow relies on: a vault
// funded for one (secret) job_id cannot be claimed by a different job_id.
const FEE_BPS = 250; // 2.5%
const FUND = 1000;

describe("settlement_job: fund-at-posting (deferred create_job)", () => {
  let mint: PublicKey;
  let feeAccount: PublicKey;
  const vaultAuthority = () => vaultAuthorityPda(jobProgram.programId);

  before(async () => {
    mint = await newMint();
    feeAccount = await ata(mint, payer.publicKey);
  });

  it("funds a vault before the job exists, then binds the provider and releases", async () => {
    const label = `fundpost-${Date.now()}`;
    const client = Keypair.generate();
    const providerKp = Keypair.generate();
    const controller = Keypair.generate();
    await fundSol(client.publicKey);

    // Vault is bound to the FUTURE job PDA (owner = jobPda(label)); createVault's
    // default owner convention does exactly this.
    const { vault, vaultToken } = await createVault(
      jobProgram.programId,
      mint,
      feeAccount,
      label,
    );
    const jobId = id32(label);
    const job = jobPda(jobId);

    // Fund the vault DIRECTLY via escrow::deposit — the job does not exist yet.
    const clientToken = await fundTokens(mint, client.publicKey, FUND);
    await initNonce(client);
    await escrowProgram.methods
      .deposit(payload(client.publicKey, FUND, 1))
      .accounts({
        vault,
        nonceTracker: noncePda(client.publicKey),
        payer: client.publicKey,
        payerToken: clientToken,
        vaultToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([client])
      .rpc();
    assert.equal(
      (await escrowProgram.account.vault.fetch(vault)).deposited.toNumber(),
      FUND,
      "vault funded before create_job",
    );

    // Now bind the chosen provider by creating the job — the deferred step.
    await jobProgram.methods
      .createJob(jobId, providerKp.publicKey, controller.publicKey, FEE_BPS)
      .accounts({
        job,
        client: client.publicKey,
        vault,
        systemProgram: SystemProgram.programId,
      })
      .signers([client])
      .rpc();

    // Deliver + approve releases to the provider minus the rake.
    const providerToken = await ata(mint, providerKp.publicKey);
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

    const expectedFee = Math.floor((FUND * FEE_BPS) / 10_000);
    assert.equal(
      Number(await tokenBalance(providerToken)),
      FUND - expectedFee,
      "provider received funds minus rake",
    );
  });

  it("a different job_id cannot claim a vault funded for another (secret) job_id", async () => {
    const label = `fundpost-secret-${Date.now()}`;
    const client = Keypair.generate();
    const attacker = Keypair.generate();
    await fundSol(client.publicKey);
    await fundSol(attacker.publicKey);

    const { vault, vaultToken } = await createVault(
      jobProgram.programId,
      mint,
      feeAccount,
      label,
    );

    // Fund the vault (bound to jobPda(label)).
    const clientToken = await fundTokens(mint, client.publicKey, FUND);
    await initNonce(client);
    await escrowProgram.methods
      .deposit(payload(client.publicKey, FUND, 1))
      .accounts({
        vault,
        nonceTracker: noncePda(client.publicKey),
        payer: client.publicKey,
        payerToken: clientToken,
        vaultToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([client])
      .rpc();

    // An attacker who does NOT know the secret job_id tries to register a
    // competing job (with themselves as provider) against the funded vault. The
    // wrong job_id derives a different job PDA, so vault.owner != job.key().
    const attackerJobId = id32(`attacker-${label}`);
    const attackerJob = jobPda(attackerJobId);
    await expectRevert(
      jobProgram.methods
        .createJob(attackerJobId, attacker.publicKey, attacker.publicKey, FEE_BPS)
        .accounts({
          job: attackerJob,
          client: attacker.publicKey,
          vault,
          systemProgram: SystemProgram.programId,
        })
        .signers([attacker])
        .rpc(),
      "wrong job_id cannot claim a funded vault (VaultNotOwned)",
    );
  });
});
