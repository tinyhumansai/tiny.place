import { assert } from "chai";
import { approve } from "@solana/spl-token";
import {
  jobEscrowProgram,
  payer,
  connection,
  newMint,
  ata,
  fundTokens,
  fundSol,
  tokenBalance,
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

describe("job_escrow", () => {
  let mint: PublicKey;
  let feeAccount: PublicKey;

  before(async () => {
    mint = await newMint();
    feeAccount = await ata(mint, payer.publicKey);
  });

  async function expectJobState(
    job: PublicKey,
    state: "open" | "delivered" | "disputed" | "resolved" | "refunded",
  ): Promise<void> {
    assert.deepEqual((await jobEscrowProgram.account.job.fetch(job)).state, {
      [state]: {},
    });
  }

  async function setupFundedJob(
    label: string,
    client: Keypair,
    provider: PublicKey,
    controller: PublicKey,
  ): Promise<{ job: PublicKey; vaultToken: PublicKey; clientToken: PublicKey }> {
    const { job, vaultToken } = await createJobEscrow(
      mint,
      feeAccount,
      label,
      client,
      provider,
      controller,
      FEE_BPS,
    );
    const clientToken = await fundTokens(mint, client.publicKey, FUND);
    await initNonce(client);
    await jobEscrowProgram.methods
      .fund(payload(client.publicKey, FUND, 1))
      .accounts({
        job,
        nonceTracker: noncePda(client.publicKey),
        client: client.publicKey,
        clientToken,
        vaultToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([client])
      .rpc();
    assert.equal((await jobEscrowProgram.account.job.fetch(job)).deposited.toNumber(), FUND);
    await expectJobState(job, "open");
    return { job, vaultToken, clientToken };
  }

  it("creates a job escrow with custody built into the job record", async () => {
    const client = Keypair.generate();
    const provider = Keypair.generate();
    const controller = Keypair.generate();
    await fundSol(client.publicKey);
    const { job, vaultToken } = await createJobEscrow(
      mint,
      feeAccount,
      "job-create",
      client,
      provider.publicKey,
      controller.publicKey,
      FEE_BPS,
    );
    const account = await jobEscrowProgram.account.job.fetch(job);
    assert.equal(account.client.toBase58(), client.publicKey.toBase58());
    assert.equal(account.provider.toBase58(), provider.publicKey.toBase58());
    assert.equal(account.controller.toBase58(), controller.publicKey.toBase58());
    assert.equal(account.vaultToken.toBase58(), vaultToken.toBase58());
    assert.equal(account.feeAccount.toBase58(), feeAccount.toBase58());
    assert.equal(account.deposited.toNumber(), 0);
    assert.equal(account.disbursed.toNumber(), 0);
  });

  it("funds with x402 nonce protection and rejects replay/expiry/payer mismatch", async () => {
    const client = Keypair.generate();
    const provider = Keypair.generate();
    const controller = Keypair.generate();
    await fundSol(client.publicKey);
    const { job, vaultToken } = await createJobEscrow(
      mint,
      feeAccount,
      "job-fund",
      client,
      provider.publicKey,
      controller.publicKey,
      FEE_BPS,
    );
    const clientToken = await fundTokens(mint, client.publicKey, 5000);
    await initNonce(client);

    await jobEscrowProgram.methods
      .fund(payload(client.publicKey, 1000, 1))
      .accounts({
        job,
        nonceTracker: noncePda(client.publicKey),
        client: client.publicKey,
        clientToken,
        vaultToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([client])
      .rpc();

    assert.equal((await jobEscrowProgram.account.job.fetch(job)).deposited.toNumber(), 1000);
    assert.equal(await tokenBalance(vaultToken), 1000n);

    await expectRevert(
      jobEscrowProgram.methods
        .fund(payload(client.publicKey, 1000, 1))
        .accounts({
          job,
          nonceTracker: noncePda(client.publicKey),
          client: client.publicKey,
          clientToken,
          vaultToken,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([client])
        .rpc(),
      "replayed nonce",
    );

    await expectRevert(
      jobEscrowProgram.methods
        .fund(payload(client.publicKey, 1000, 2, client.publicKey, -10))
        .accounts({
          job,
          nonceTracker: noncePda(client.publicKey),
          client: client.publicKey,
          clientToken,
          vaultToken,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([client])
        .rpc(),
      "expired payment",
    );

    await expectRevert(
      jobEscrowProgram.methods
        .fund(payload(Keypair.generate().publicKey, 1000, 3))
        .accounts({
          job,
          nonceTracker: noncePda(client.publicKey),
          client: client.publicKey,
          clientToken,
          vaultToken,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([client])
        .rpc(),
      "payer mismatch",
    );
  });

  it("lets a session delegate fund the job without the client signing", async () => {
    const client = Keypair.generate();
    const provider = Keypair.generate();
    const controller = Keypair.generate();
    const delegate = Keypair.generate();
    await fundSol(client.publicKey);
    await fundSol(delegate.publicKey);
    const { job, vaultToken } = await createJobEscrow(
      mint,
      feeAccount,
      "job-fund-for",
      client,
      provider.publicKey,
      controller.publicKey,
      FEE_BPS,
    );
    const clientToken = await fundTokens(mint, client.publicKey, 5000);
    await initNonce(client);
    await approve(connection, payer, clientToken, delegate.publicKey, client, 3000);

    await jobEscrowProgram.methods
      .fundFor(payload(client.publicKey, 1000, 1))
      .accounts({
        job,
        nonceTracker: noncePda(client.publicKey),
        authority: delegate.publicKey,
        clientToken,
        vaultToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([delegate])
      .rpc();

    assert.equal((await jobEscrowProgram.account.job.fetch(job)).deposited.toNumber(), 1000);
    assert.equal(await tokenBalance(vaultToken), 1000n);
    assert.equal(await tokenBalance(clientToken), 4000n);
  });

  it("deliver -> approve pays provider minus fee and drains the job vault", async () => {
    const client = Keypair.generate();
    const provider = Keypair.generate();
    const controller = Keypair.generate();
    await fundSol(client.publicKey);
    await fundSol(provider.publicKey);
    const providerToken = await ata(mint, provider.publicKey);
    const feeBefore = await tokenBalance(feeAccount);
    const { job, vaultToken } = await setupFundedJob(
      "job-happy",
      client,
      provider.publicKey,
      controller.publicKey,
    );

    await jobEscrowProgram.methods
      .markDelivered()
      .accounts({ job, actor: provider.publicKey })
      .signers([provider])
      .rpc();
    await expectJobState(job, "delivered");

    await jobEscrowProgram.methods
      .approve()
      .accounts({
        job,
        actor: client.publicKey,
        vaultToken,
        recipientToken: providerToken,
        feeToken: feeAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([client])
      .rpc();

    const fee = Math.floor((FUND * FEE_BPS) / 10_000);
    assert.equal(await tokenBalance(providerToken), BigInt(FUND - fee));
    assert.equal((await tokenBalance(feeAccount)) - feeBefore, BigInt(fee));
    assert.equal(await tokenBalance(vaultToken), 0n);
    const account = await jobEscrowProgram.account.job.fetch(job);
    assert.equal(account.disbursed.toNumber(), FUND);
    await expectJobState(job, "resolved");
  });

  it("dispute -> controller resolves to client without a fee", async () => {
    const client = Keypair.generate();
    const provider = Keypair.generate();
    const controller = Keypair.generate();
    await fundSol(client.publicKey);
    await fundSol(provider.publicKey);
    await fundSol(controller.publicKey);
    const clientToken = await ata(mint, client.publicKey);
    const { job, vaultToken } = await setupFundedJob(
      "job-dispute",
      client,
      provider.publicKey,
      controller.publicKey,
    );
    const before = await tokenBalance(clientToken);

    await jobEscrowProgram.methods.markDelivered().accounts({ job, actor: provider.publicKey }).signers([provider]).rpc();
    await jobEscrowProgram.methods.dispute().accounts({ job, actor: client.publicKey }).signers([client]).rpc();
    await expectJobState(job, "disputed");

    await jobEscrowProgram.methods
      .resolve(false)
      .accounts({
        job,
        actor: controller.publicKey,
        vaultToken,
        recipientToken: clientToken,
        feeToken: feeAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([controller])
      .rpc();

    assert.equal((await tokenBalance(clientToken)) - before, BigInt(FUND));
    await expectJobState(job, "resolved");
  });

  it("refund while open returns funds to the client", async () => {
    const client = Keypair.generate();
    const provider = Keypair.generate();
    const controller = Keypair.generate();
    await fundSol(client.publicKey);
    const clientToken = await ata(mint, client.publicKey);
    const { job, vaultToken } = await setupFundedJob(
      "job-refund",
      client,
      provider.publicKey,
      controller.publicKey,
    );
    const before = await tokenBalance(clientToken);

    await jobEscrowProgram.methods
      .refund()
      .accounts({
        job,
        actor: client.publicKey,
        vaultToken,
        recipientToken: clientToken,
        feeToken: feeAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([client])
      .rpc();

    assert.equal((await tokenBalance(clientToken)) - before, BigInt(FUND));
    await expectJobState(job, "refunded");
  });

  it("rejects unauthorized actors and wrong fee account mint at creation", async () => {
    const client = Keypair.generate();
    const provider = Keypair.generate();
    const stranger = Keypair.generate();
    const controller = Keypair.generate();
    await fundSol(client.publicKey);
    await fundSol(stranger.publicKey);
    const { job } = await setupFundedJob(
      "job-authz",
      client,
      provider.publicKey,
      controller.publicKey,
    );

    await expectRevert(
      jobEscrowProgram.methods
        .markDelivered()
        .accounts({ job, actor: stranger.publicKey })
        .signers([stranger])
        .rpc(),
      "non-provider deliver",
    );

    const otherMint = await newMint();
    const wrongFee = await ata(otherMint, payer.publicKey);
    const otherClient = Keypair.generate();
    await fundSol(otherClient.publicKey);
    await expectRevert(
      createJobEscrow(
        mint,
        wrongFee,
        "job-bad-fee",
        otherClient,
        provider.publicKey,
        controller.publicKey,
        FEE_BPS,
      ),
      "wrong-mint fee account",
    );
  });
});
