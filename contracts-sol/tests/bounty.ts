import { assert } from "chai";
import {
  jobEscrowProgram,
  payer,
  newMint,
  ata,
  fundTokens,
  fundSol,
  tokenBalance,
  createBounty,
  createJobEscrow,
  initNonce,
  noncePda,
  payload,
  expectRevert,
  Keypair,
  PublicKey,
  TOKEN_PROGRAM_ID,
} from "./setup";

const FEE_BPS = 250;
const FUND = 1000;

describe("job_escrow bounties", () => {
  let mint: PublicKey;
  let feeAccount: PublicKey;

  before(async () => {
    mint = await newMint();
    feeAccount = await ata(mint, payer.publicKey);
  });

  async function expectState(
    job: PublicKey,
    state: "open" | "resolved" | "refunded",
  ): Promise<void> {
    assert.deepEqual((await jobEscrowProgram.account.job.fetch(job)).state, {
      [state]: {},
    });
  }

  // Create a bounty and fund it from the sponsor via the shared `fund` path.
  async function setupFundedBounty(
    label: string,
    sponsor: Keypair,
    controller: PublicKey,
  ): Promise<{ job: PublicKey; vaultToken: PublicKey; sponsorToken: PublicKey }> {
    const { job, vaultToken } = await createBounty(
      mint,
      feeAccount,
      label,
      sponsor,
      controller,
      FEE_BPS,
    );
    const sponsorToken = await fundTokens(mint, sponsor.publicKey, FUND);
    await initNonce(sponsor);
    await jobEscrowProgram.methods
      .fund(payload(sponsor.publicKey, FUND, 1))
      .accounts({
        job,
        nonceTracker: noncePda(sponsor.publicKey),
        client: sponsor.publicKey,
        clientToken: sponsorToken,
        vaultToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([sponsor])
      .rpc();
    assert.equal((await jobEscrowProgram.account.job.fetch(job)).deposited.toNumber(), FUND);
    await expectState(job, "open");
    return { job, vaultToken, sponsorToken };
  }

  it("creates a bounty with no provider baked in and kind=bounty", async () => {
    const sponsor = Keypair.generate();
    const controller = Keypair.generate();
    await fundSol(sponsor.publicKey);
    const { job, vaultToken } = await createBounty(
      mint,
      feeAccount,
      "bounty-create",
      sponsor,
      controller.publicKey,
      FEE_BPS,
    );
    const account = await jobEscrowProgram.account.job.fetch(job);
    assert.deepEqual(account.kind, { bounty: {} });
    assert.equal(account.client.toBase58(), sponsor.publicKey.toBase58());
    assert.equal(account.provider.toBase58(), PublicKey.default.toBase58());
    assert.equal(account.controller.toBase58(), controller.publicKey.toBase58());
    assert.equal(account.vaultToken.toBase58(), vaultToken.toBase58());
    assert.equal(account.deposited.toNumber(), 0);
  });

  it("lets the controller award the whole pot to an arbitrary winner minus fee", async () => {
    const sponsor = Keypair.generate();
    const controller = Keypair.generate();
    const winner = Keypair.generate();
    await fundSol(sponsor.publicKey);
    await fundSol(controller.publicKey);
    const winnerToken = await ata(mint, winner.publicKey);
    const feeBefore = await tokenBalance(feeAccount);
    const { job, vaultToken } = await setupFundedBounty(
      "bounty-award",
      sponsor,
      controller.publicKey,
    );

    await jobEscrowProgram.methods
      .awardBounty()
      .accounts({
        job,
        actor: controller.publicKey,
        vaultToken,
        recipientToken: winnerToken,
        feeToken: feeAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([controller])
      .rpc();

    const fee = Math.floor((FUND * FEE_BPS) / 10_000);
    assert.equal(await tokenBalance(winnerToken), BigInt(FUND - fee));
    assert.equal((await tokenBalance(feeAccount)) - feeBefore, BigInt(fee));
    assert.equal(await tokenBalance(vaultToken), 0n);
    const account = await jobEscrowProgram.account.job.fetch(job);
    assert.equal(account.disbursed.toNumber(), FUND);
    // The winner is recorded into `provider` for indexers.
    assert.equal(account.provider.toBase58(), winner.publicKey.toBase58());
    await expectState(job, "resolved");
  });

  it("rejects a non-controller awarding the bounty (server is the sole disburser)", async () => {
    const sponsor = Keypair.generate();
    const controller = Keypair.generate();
    const stranger = Keypair.generate();
    await fundSol(sponsor.publicKey);
    await fundSol(stranger.publicKey);
    const strangerToken = await ata(mint, stranger.publicKey);
    const { job, vaultToken } = await setupFundedBounty(
      "bounty-award-authz",
      sponsor,
      controller.publicKey,
    );

    await expectRevert(
      jobEscrowProgram.methods
        .awardBounty()
        .accounts({
          job,
          actor: stranger.publicKey,
          vaultToken,
          recipientToken: strangerToken,
          feeToken: feeAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([stranger])
        .rpc(),
      "non-controller award",
    );
  });

  it("lets the controller cancel an un-awarded bounty back to the sponsor with no fee", async () => {
    const sponsor = Keypair.generate();
    const controller = Keypair.generate();
    await fundSol(sponsor.publicKey);
    await fundSol(controller.publicKey);
    const sponsorAta = await ata(mint, sponsor.publicKey);
    const { job, vaultToken } = await setupFundedBounty(
      "bounty-cancel",
      sponsor,
      controller.publicKey,
    );
    const before = await tokenBalance(sponsorAta);
    const feeBefore = await tokenBalance(feeAccount);

    await jobEscrowProgram.methods
      .cancelBounty()
      .accounts({
        job,
        actor: controller.publicKey,
        vaultToken,
        recipientToken: sponsorAta,
        feeToken: feeAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([controller])
      .rpc();

    assert.equal((await tokenBalance(sponsorAta)) - before, BigInt(FUND));
    assert.equal((await tokenBalance(feeAccount)) - feeBefore, 0n);
    await expectState(job, "refunded");
  });

  it("rejects the sponsor cancelling their own bounty (council-only refund)", async () => {
    const sponsor = Keypair.generate();
    const controller = Keypair.generate();
    await fundSol(sponsor.publicKey);
    const sponsorAta = await ata(mint, sponsor.publicKey);
    const { job, vaultToken } = await setupFundedBounty(
      "bounty-cancel-authz",
      sponsor,
      controller.publicKey,
    );

    await expectRevert(
      jobEscrowProgram.methods
        .cancelBounty()
        .accounts({
          job,
          actor: sponsor.publicKey,
          vaultToken,
          recipientToken: sponsorAta,
          feeToken: feeAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([sponsor])
        .rpc(),
      "sponsor cancel",
    );
  });

  it("rejects job-path instructions on a bounty (no client self-approval)", async () => {
    const sponsor = Keypair.generate();
    const controller = Keypair.generate();
    await fundSol(sponsor.publicKey);
    const sponsorAta = await ata(mint, sponsor.publicKey);
    const { job, vaultToken } = await setupFundedBounty(
      "bounty-kind-guard",
      sponsor,
      controller.publicKey,
    );

    // markDelivered, approve, refund are all job-only.
    await expectRevert(
      jobEscrowProgram.methods
        .markDelivered()
        .accounts({ job, actor: sponsor.publicKey })
        .signers([sponsor])
        .rpc(),
      "markDelivered on bounty",
    );
    await expectRevert(
      jobEscrowProgram.methods
        .approve()
        .accounts({
          job,
          actor: sponsor.publicKey,
          vaultToken,
          recipientToken: sponsorAta,
          feeToken: feeAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([sponsor])
        .rpc(),
      "approve on bounty",
    );
    await expectRevert(
      jobEscrowProgram.methods
        .refund()
        .accounts({
          job,
          actor: sponsor.publicKey,
          vaultToken,
          recipientToken: sponsorAta,
          feeToken: feeAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([sponsor])
        .rpc(),
      "refund on bounty",
    );
  });

  it("rejects award_bounty on a plain job (kind guard both ways)", async () => {
    const client = Keypair.generate();
    const provider = Keypair.generate();
    const controller = Keypair.generate();
    await fundSol(client.publicKey);
    await fundSol(controller.publicKey);
    const providerToken = await ata(mint, provider.publicKey);
    const { job, vaultToken } = await createJobEscrow(
      mint,
      feeAccount,
      "bounty-award-on-job",
      client,
      provider.publicKey,
      controller.publicKey,
      FEE_BPS,
    );

    await expectRevert(
      jobEscrowProgram.methods
        .awardBounty()
        .accounts({
          job,
          actor: controller.publicKey,
          vaultToken,
          recipientToken: providerToken,
          feeToken: feeAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([controller])
        .rpc(),
      "award on job",
    );
  });
});
