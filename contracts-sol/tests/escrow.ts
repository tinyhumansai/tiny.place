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
  jobPda,
  noncePda,
  vaultAuthorityPda,
  payload,
  expectRevert,
  BN,
  Keypair,
  PublicKey,
  TOKEN_PROGRAM_ID,
} from "./setup";

describe("escrow (custody)", () => {
  let mint: PublicKey;
  let feeAccount: PublicKey;

  before(async () => {
    mint = await newMint();
    feeAccount = await ata(mint, payer.publicKey);
  });

  it("creates a vault bound to a settlement program", async () => {
    const { vaultId, vault, vaultToken } = await createVault(
      jobProgram.programId,
      mint,
      feeAccount,
      "escrow-create",
    );
    const acc = await escrowProgram.account.vault.fetch(vault);
    assert.equal(acc.settlementProgram.toBase58(), jobProgram.programId.toBase58());
    assert.equal(acc.owner.toBase58(), jobPda(vaultId).toBase58());
    assert.equal(acc.authority.toBase58(), vaultAuthorityPda(jobProgram.programId).toBase58());
    assert.equal(acc.mint.toBase58(), mint.toBase58());
    assert.equal(acc.tokenAccount.toBase58(), vaultToken.toBase58());
    assert.equal(acc.feeAccount.toBase58(), feeAccount.toBase58());
    assert.equal(acc.deposited.toNumber(), 0);
    assert.equal(acc.disbursed.toNumber(), 0);
  });

  it("accepts an x402 deposit and tracks the balance", async () => {
    const { vault, vaultToken } = await createVault(
      jobProgram.programId,
      mint,
      feeAccount,
      "escrow-deposit",
    );
    const depositor = Keypair.generate();
    await fundSol(depositor.publicKey);
    const depositorToken = await fundTokens(mint, depositor.publicKey, 5000);
    await initNonce(depositor);

    await escrowProgram.methods
      .deposit(payload(depositor.publicKey, 1000, 1))
      .accounts({
        vault,
        nonceTracker: noncePda(depositor.publicKey),
        payer: depositor.publicKey,
        payerToken: depositorToken,
        vaultToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([depositor])
      .rpc();

    assert.equal((await escrowProgram.account.vault.fetch(vault)).deposited.toNumber(), 1000);
    assert.equal(await tokenBalance(vaultToken), 1000n);

    // Replay: same nonce must be rejected.
    await expectRevert(
      escrowProgram.methods
        .deposit(payload(depositor.publicKey, 1000, 1))
        .accounts({
          vault,
          nonceTracker: noncePda(depositor.publicKey),
          payer: depositor.publicKey,
          payerToken: depositorToken,
          vaultToken,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([depositor])
        .rpc(),
      "replayed nonce",
    );

    // Expired payment must be rejected.
    await expectRevert(
      escrowProgram.methods
        .deposit(payload(depositor.publicKey, 1000, 2, depositor.publicKey, -10))
        .accounts({
          vault,
          nonceTracker: noncePda(depositor.publicKey),
          payer: depositor.publicKey,
          payerToken: depositorToken,
          vaultToken,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([depositor])
        .rpc(),
      "expired payment",
    );

    // Payload payer must match the signer.
    await expectRevert(
      escrowProgram.methods
        .deposit(payload(Keypair.generate().publicKey, 1000, 3))
        .accounts({
          vault,
          nonceTracker: noncePda(depositor.publicKey),
          payer: depositor.publicKey,
          payerToken: depositorToken,
          vaultToken,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([depositor])
        .rpc(),
      "payer mismatch",
    );
  });

  it("rejects a direct disburse not signed by the bound settlement authority", async () => {
    const { vault, vaultToken } = await createVault(
      jobProgram.programId,
      mint,
      feeAccount,
      "escrow-disburse-guard",
    );
    const rogue = Keypair.generate();
    await fundSol(rogue.publicKey);
    const dest = await ata(mint, rogue.publicKey);

    // A random signer is not the vault.authority PDA -> Unauthorized.
    await expectRevert(
      escrowProgram.methods
        .disburse(new BN(0), new BN(0))
        .accounts({
          vault,
          authority: rogue.publicKey,
          vaultToken,
          recipientToken: dest,
          feeToken: feeAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([rogue])
        .rpc(),
      "unauthorized disburse",
    );
  });

  // Regression for the fee-account validation finding: a vault must reject a fee
  // account whose mint differs from the vault's mint. Otherwise the fee transfer
  // on every disburse reverts, permanently locking the vault's principal with no
  // recovery path. Before the fix fee_account was an unchecked AccountInfo and
  // this createVault succeeded; after the fix it reverts at creation.
  it("rejects a vault whose fee account has the wrong mint", async () => {
    const otherMint = await newMint();
    const wrongFee = await ata(otherMint, payer.publicKey);
    await expectRevert(
      createVault(jobProgram.programId, mint, wrongFee, "escrow-bad-fee"),
      "wrong-mint fee account",
    );
  });
});
