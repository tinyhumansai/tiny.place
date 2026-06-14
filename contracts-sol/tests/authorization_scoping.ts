import { assert } from "chai";
import {
  escrowProgram,
  jobProgram,
  pokerProgram,
  lotteryProgram,
  payer,
  newMint,
  ata,
  fundSol,
  createVault,
  vaultAuthorityPda,
  jobPda,
  gamePda,
  roundPda,
  id32,
  expectRevert,
  BN,
  Keypair,
  PublicKey,
  SystemProgram,
} from "./setup";

// Adversarial coverage for the authorization-scoping invariants (E5 "Authorized
// disburse" / J5 "Vault binding" in FORMAL_VERIFICATION.md). The Kani proofs
// cover the *arithmetic* — escrow never releases more than it holds — but the
// *binding* property (a vault's funds can only ever move under the decisions of
// the one settlement program, and the one record, it was bound to) depends on
// runtime account constraints Kani can't model. These negative tests pin that
// property: cross-program hijack and sibling-record hijack must both revert, and
// the stored disburse authority must be exactly the bound program's PDA.
const FEE_BPS = 250; // 2.5%
const STAKE = 1000;
const MAX_PLAYERS = 4;

describe("authorization scoping (cross-program custody isolation)", () => {
  let mint: PublicKey;
  let feeAccount: PublicKey;

  before(async () => {
    mint = await newMint();
    feeAccount = await ata(mint, payer.publicKey);
  });

  // 1. A settlement program can only operate on vaults bound to it. A foreign
  //    program trying to register its own record over someone else's vault is
  //    rejected at creation (escrow stores `settlement_program` at bind time and
  //    each policy enforces `vault.settlement_program == crate::ID`), so funds in
  //    a vault can never come under a different program's vault_authority.
  it("a settlement program cannot register over a vault bound to a different program", async () => {
    // Vault bound to settlement_job.
    const { vault: jobVault } = await createVault(
      jobProgram.programId,
      mint,
      feeAccount,
      "scope-job-vault",
    );

    // Poker cannot create a game over a job-bound vault (VaultNotBound).
    const gid = id32("scope-poker-steal");
    await expectRevert(
      pokerProgram.methods
        .createGame(gid, Keypair.generate().publicKey, new BN(STAKE), MAX_PLAYERS, FEE_BPS)
        .accounts({
          game: gamePda(gid),
          creator: payer.publicKey,
          vault: jobVault,
          systemProgram: SystemProgram.programId,
        })
        .signers([])
        .rpc(),
      "poker claiming a job-bound vault",
    );

    // Lottery cannot create a round over a job-bound vault either.
    const rid = id32("scope-lottery-steal");
    await expectRevert(
      lotteryProgram.methods
        .createRound(rid, Keypair.generate().publicKey, new BN(STAKE), FEE_BPS)
        .accounts({
          round: roundPda(rid),
          creator: payer.publicKey,
          vault: jobVault,
          systemProgram: SystemProgram.programId,
        })
        .signers([])
        .rpc(),
      "lottery claiming a job-bound vault",
    );

    // Symmetric direction: settlement_job cannot claim a poker-bound vault.
    const { vault: pokerVault } = await createVault(
      pokerProgram.programId,
      mint,
      feeAccount,
      "scope-poker-vault",
    );
    const jid = id32("scope-job-steal");
    const client = Keypair.generate();
    await fundSol(client.publicKey);
    await expectRevert(
      jobProgram.methods
        .createJob(jid, Keypair.generate().publicKey, Keypair.generate().publicKey, FEE_BPS)
        .accounts({
          job: jobPda(jid),
          client: client.publicKey,
          vault: pokerVault,
          systemProgram: SystemProgram.programId,
        })
        .signers([client])
        .rpc(),
      "job claiming a poker-bound vault",
    );
  });

  // 2. The disburse authority escrow records at bind time is exactly
  //    PDA(["vault_authority"], bound_program) and never any other program's PDA.
  //    Since `disburse` requires the signer to equal `vault.authority`, and a PDA
  //    can only be signed by its owning program via CPI, this is what guarantees
  //    only the bound program can ever authorize a release. Complements the
  //    rogue-keypair guard in escrow.ts.
  it("records the disburse authority as exactly the bound program's vault_authority PDA", async () => {
    const cases = [
      { program: jobProgram, label: "scope-auth-job" },
      { program: pokerProgram, label: "scope-auth-poker" },
      { program: lotteryProgram, label: "scope-auth-lottery" },
    ];
    const foreignPdas = [
      vaultAuthorityPda(jobProgram.programId),
      vaultAuthorityPda(pokerProgram.programId),
      vaultAuthorityPda(lotteryProgram.programId),
    ];

    for (const { program, label } of cases) {
      const { vault } = await createVault(program.programId, mint, feeAccount, label);
      const expected = vaultAuthorityPda(program.programId);
      const acc = await escrowProgram.account.vault.fetch(vault);

      assert.equal(
        acc.authority.toBase58(),
        expected.toBase58(),
        `${label}: authority must be its own program's vault_authority PDA`,
      );
      for (const pda of foreignPdas) {
        if (pda.equals(expected)) continue;
        assert.notEqual(
          acc.authority.toBase58(),
          pda.toBase58(),
          `${label}: authority must not equal another program's vault_authority PDA`,
        );
      }
    }
  });

  // 3. Even within the correct program, a vault is bound 1:1 to the single record
  //    recorded as `vault.owner`. A sibling record (same program, different id)
  //    cannot claim an already-bound vault, so a depositor's funds are scoped to
  //    exactly the job/game/round they were committed to — never drained by a
  //    competing record the same program could mint.
  it("a vault is scoped to its single owning record; a sibling record cannot claim it", async () => {
    // settlement_job: vault owned by job A -> job B (different id) is rejected.
    {
      const ownerA = jobPda(id32("scope-owner-job-A"));
      const { vault } = await createVault(
        jobProgram.programId,
        mint,
        feeAccount,
        "scope-owner-job-vault",
        ownerA,
      );
      const idB = id32("scope-owner-job-B");
      const client = Keypair.generate();
      await fundSol(client.publicKey);
      await expectRevert(
        jobProgram.methods
          .createJob(idB, Keypair.generate().publicKey, Keypair.generate().publicKey, FEE_BPS)
          .accounts({
            job: jobPda(idB),
            client: client.publicKey,
            vault,
            systemProgram: SystemProgram.programId,
          })
          .signers([client])
          .rpc(),
        "sibling job claiming another job's vault",
      );
    }

    // settlement_game_poker: vault owned by game A -> game B is rejected.
    {
      const ownerA = gamePda(id32("scope-owner-poker-A"));
      const { vault } = await createVault(
        pokerProgram.programId,
        mint,
        feeAccount,
        "scope-owner-poker-vault",
        ownerA,
      );
      const idB = id32("scope-owner-poker-B");
      await expectRevert(
        pokerProgram.methods
          .createGame(idB, Keypair.generate().publicKey, new BN(STAKE), MAX_PLAYERS, FEE_BPS)
          .accounts({
            game: gamePda(idB),
            creator: payer.publicKey,
            vault,
            systemProgram: SystemProgram.programId,
          })
          .signers([])
          .rpc(),
        "sibling game claiming another game's vault",
      );
    }

    // settlement_game_lottery: vault owned by round A -> round B is rejected.
    {
      const ownerA = roundPda(id32("scope-owner-lottery-A"));
      const { vault } = await createVault(
        lotteryProgram.programId,
        mint,
        feeAccount,
        "scope-owner-lottery-vault",
        ownerA,
      );
      const idB = id32("scope-owner-lottery-B");
      await expectRevert(
        lotteryProgram.methods
          .createRound(idB, Keypair.generate().publicKey, new BN(STAKE), FEE_BPS)
          .accounts({
            round: roundPda(idB),
            creator: payer.publicKey,
            vault,
            systemProgram: SystemProgram.programId,
          })
          .signers([])
          .rpc(),
        "sibling round claiming another round's vault",
      );
    }
  });
});
