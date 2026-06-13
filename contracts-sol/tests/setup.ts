// Shared helpers for the Anchor integration suite.
//
// Run with `anchor test` from contracts-sol/ (builds the programs, boots a
// local validator, and executes these via ts-mocha per Anchor.toml).
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { createHash } from "crypto";

export const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

// Anchor populates `workspace` with PascalCase program names from Anchor.toml.
export const escrowProgram = anchor.workspace.Escrow as anchor.Program<any>;
export const jobProgram = anchor.workspace.SettlementJob as anchor.Program<any>;
export const pokerProgram =
  anchor.workspace.SettlementGamePoker as anchor.Program<any>;

export const payer = (provider.wallet as anchor.Wallet).payer;
export const connection = provider.connection;

/** Deterministic 32-byte id from a label (used for vault/job/game ids). */
export function id32(label: string): number[] {
  return Array.from(createHash("sha256").update(label).digest());
}

/** Fund a keypair with SOL so it can pay fees / rent for accounts it creates. */
export async function fundSol(to: PublicKey, sol = 2): Promise<void> {
  const tx = new anchor.web3.Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: to,
      lamports: sol * LAMPORTS_PER_SOL,
    }),
  );
  await provider.sendAndConfirm(tx, []);
}

/** Create a fresh SPL mint (6 decimals) with the test payer as authority. */
export function newMint(): Promise<PublicKey> {
  return createMint(connection, payer, payer.publicKey, null, 6);
}

/** Get/create an owner's associated token account for a mint. */
export async function ata(mint: PublicKey, owner: PublicKey): Promise<PublicKey> {
  const acc = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    owner,
    true,
  );
  return acc.address;
}

/** Mint `amount` base units to an owner's ATA, returning the ATA. */
export async function fundTokens(
  mint: PublicKey,
  owner: PublicKey,
  amount: number,
): Promise<PublicKey> {
  const account = await ata(mint, owner);
  await mintTo(connection, payer, mint, account, payer, amount);
  return account;
}

export async function tokenBalance(account: PublicKey): Promise<bigint> {
  return (await getAccount(connection, account)).amount;
}

// --- PDA derivations (must match the on-chain seeds) ---

export function vaultPda(vaultId: number[]): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), Buffer.from(vaultId)],
    escrowProgram.programId,
  )[0];
}

export function noncePda(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("nonce"), owner.toBuffer()],
    escrowProgram.programId,
  )[0];
}

export function vaultAuthorityPda(settlementProgram: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault_authority")],
    settlementProgram,
  )[0];
}

export function jobPda(jobId: number[]): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("job"), Buffer.from(jobId)],
    jobProgram.programId,
  )[0];
}

export function gamePda(gameId: number[]): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("game"), Buffer.from(gameId)],
    pokerProgram.programId,
  )[0];
}

export function playerPda(game: PublicKey, player: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("player"), game.toBuffer(), player.toBuffer()],
    pokerProgram.programId,
  )[0];
}

/** An x402 PaymentPayload object matching the on-chain struct. */
export function payload(
  payerKey: PublicKey,
  amount: number,
  nonce: number,
  payee = payerKey,
  expirySecondsFromNow = 3600,
): {
  amount: BN;
  payer: PublicKey;
  payee: PublicKey;
  nonce: BN;
  expiry: BN;
} {
  return {
    amount: new BN(amount),
    payer: payerKey,
    payee,
    nonce: new BN(nonce),
    expiry: new BN(Math.floor(Date.now() / 1000) + expirySecondsFromNow),
  };
}

/**
 * Create an escrow vault bound to `settlementProgram` and return its handles.
 * The vault token account is a fresh keypair the escrow program initializes.
 */
export async function createVault(
  settlementProgram: PublicKey,
  mint: PublicKey,
  feeAccount: PublicKey,
  label: string,
): Promise<{ vaultId: number[]; vault: PublicKey; vaultToken: PublicKey }> {
  const vaultId = id32(label);
  const vault = vaultPda(vaultId);
  const vaultToken = Keypair.generate();

  await escrowProgram.methods
    .createVault(vaultId, settlementProgram)
    .accounts({
      vault,
      vaultToken: vaultToken.publicKey,
      creator: payer.publicKey,
      mint,
      feeAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
      systemProgram: SystemProgram.programId,
    })
    .signers([vaultToken])
    .rpc();

  return { vaultId, vault, vaultToken: vaultToken.publicKey };
}

/** Initialize the x402 nonce tracker for an owner (idempotent-ish; call once). */
export async function initNonce(owner: Keypair): Promise<PublicKey> {
  const nonceTracker = noncePda(owner.publicKey);
  await escrowProgram.methods
    .initNonce()
    .accounts({
      nonceTracker,
      owner: owner.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([owner])
    .rpc();
  return nonceTracker;
}

/** Assert that a promise rejects (used for negative/authorization tests). */
export async function expectRevert(p: Promise<unknown>, label: string): Promise<void> {
  try {
    await p;
  } catch {
    return;
  }
  throw new Error(`expected revert but call succeeded: ${label}`);
}

export { BN, Keypair, PublicKey, SystemProgram, TOKEN_PROGRAM_ID };
