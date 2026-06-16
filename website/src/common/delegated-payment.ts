import {
	PublicKey,
	Transaction,
	TransactionInstruction,
} from "@solana/web3.js";
import {
	SOLANA_TOKEN_PROGRAM_ID,
	SOLANA_USDC_MINT,
} from "@tinyhumansai/tinyplace";

import { createSolanaConnection } from "@src/common/solana-rpc";

// The Associated Token Account program. Not exported by the SDK, so it is
// defined here alongside the other Solana program ids it complements.
const ASSOCIATED_TOKEN_PROGRAM_ID =
	"ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

const TOKEN_TRANSFER_CHECKED_INSTRUCTION = 12;
const TOKEN_APPROVE_CHECKED_INSTRUCTION = 13;
const ATA_CREATE_IDEMPOTENT_INSTRUCTION = 1;
const USDC_DECIMALS = 6;

// The job escrow program and its `fund_for` Anchor discriminator
// (sha256("global:fund_for")[:8]).
const ESCROW_PROGRAM_ID = "6s1cWEMcWjWZ3ut6aDD5g4CFBxpKBz5S4DLkrZdy5jR2";
const DEPOSIT_FOR_DISCRIMINATOR = new Uint8Array([
	196, 156, 220, 121, 121, 102, 167, 30,
]);
// Byte offsets into the job escrow Job account (8-byte discriminator + fields).
const VAULT_MINT_OFFSET = 136;
const VAULT_TOKEN_ACCOUNT_OFFSET = 168;
// Byte offset of last_nonce in the NonceTracker account (disc + owner[32]).
const NONCE_TRACKER_LAST_NONCE_OFFSET = 40;

/** Encodes amount (base units) as a little-endian u64. */
function encodeU64LittleEndian(amount: string): Uint8Array {
	let value = BigInt(amount);
	const bytes = new Uint8Array(8);
	for (let index = 0; index < 8; index += 1) {
		bytes[index] = Number(value & 0xffn);
		value >>= 8n;
	}
	return bytes;
}

/** Derives the canonical Associated Token Account for owner + mint. */
export function associatedTokenAddress(owner: string, mint: string): PublicKey {
	const [address] = PublicKey.findProgramAddressSync(
		[
			new PublicKey(owner).toBuffer(),
			new PublicKey(SOLANA_TOKEN_PROGRAM_ID).toBuffer(),
			new PublicKey(mint).toBuffer(),
		],
		new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID)
	);
	return address;
}

/**
 * SPL Token TransferChecked, authorized by the delegate. Account order matches
 * what the backend validator expects: source, mint, destination, authority.
 */
function transferCheckedInstruction(options: {
	source: PublicKey;
	mint: PublicKey;
	destination: PublicKey;
	authority: PublicKey;
	amount: string;
	decimals: number;
}): TransactionInstruction {
	const data = new Uint8Array(10);
	data[0] = TOKEN_TRANSFER_CHECKED_INSTRUCTION;
	data.set(encodeU64LittleEndian(options.amount), 1);
	data[9] = options.decimals;
	return new TransactionInstruction({
		programId: new PublicKey(SOLANA_TOKEN_PROGRAM_ID),
		keys: [
			{ pubkey: options.source, isSigner: false, isWritable: true },
			{ pubkey: options.mint, isSigner: false, isWritable: false },
			{ pubkey: options.destination, isSigner: false, isWritable: true },
			{ pubkey: options.authority, isSigner: true, isWritable: false },
		],
		data: Buffer.from(data),
	});
}

/** Idempotent create of the payee's ATA, funded by the facilitator. */
function createIdempotentAtaInstruction(options: {
	funder: PublicKey;
	associatedAccount: PublicKey;
	owner: PublicKey;
	mint: PublicKey;
}): TransactionInstruction {
	return new TransactionInstruction({
		programId: new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID),
		keys: [
			{ pubkey: options.funder, isSigner: true, isWritable: true },
			{ pubkey: options.associatedAccount, isSigner: false, isWritable: true },
			{ pubkey: options.owner, isSigner: false, isWritable: false },
			{ pubkey: options.mint, isSigner: false, isWritable: false },
			{
				pubkey: new PublicKey("11111111111111111111111111111111"),
				isSigner: false,
				isWritable: false,
			},
			{
				pubkey: new PublicKey(SOLANA_TOKEN_PROGRAM_ID),
				isSigner: false,
				isWritable: false,
			},
		],
		data: Buffer.from([ATA_CREATE_IDEMPOTENT_INSTRUCTION]),
	});
}

/**
 * SPL Token ApproveChecked: the payer (owner) delegates `delegate` to spend up
 * to `amount` of `mint` from their token account. Signed by the wallet (Phantom)
 * once at login. Account order: source (owner ATA), mint, delegate, owner.
 */
export function approveCheckedInstruction(options: {
	ownerTokenAccount: PublicKey;
	mint: PublicKey;
	delegate: PublicKey;
	owner: PublicKey;
	amount: string;
	decimals?: number;
}): TransactionInstruction {
	const data = new Uint8Array(10);
	data[0] = TOKEN_APPROVE_CHECKED_INSTRUCTION;
	data.set(encodeU64LittleEndian(options.amount), 1);
	data[9] = options.decimals ?? USDC_DECIMALS;
	return new TransactionInstruction({
		programId: new PublicKey(SOLANA_TOKEN_PROGRAM_ID),
		keys: [
			{ pubkey: options.ownerTokenAccount, isSigner: false, isWritable: true },
			{ pubkey: options.mint, isSigner: false, isWritable: false },
			{ pubkey: options.delegate, isSigner: false, isWritable: false },
			{ pubkey: options.owner, isSigner: true, isWritable: false },
		],
		data: Buffer.from(data),
	});
}

/**
 * Builds the one-time delegation approval transaction for the wallet (Phantom)
 * to sign: it grants the browser session key delegate authority over the
 * payer's USDC up to `amount`. The payer is the fee payer for this login tx.
 */
export async function buildApproveTransaction(options: {
	rpcUrl: string;
	payer: string;
	delegate: string;
	amount: string;
	mint?: string;
	decimals?: number;
}): Promise<Transaction> {
	const mint = options.mint ?? SOLANA_USDC_MINT;
	const owner = new PublicKey(options.payer);
	const connection = createSolanaConnection(options.rpcUrl);
	const { blockhash } = await connection.getLatestBlockhash("confirmed");
	const transaction = new Transaction();
	transaction.feePayer = owner;
	transaction.recentBlockhash = blockhash;
	transaction.add(
		approveCheckedInstruction({
			ownerTokenAccount: associatedTokenAddress(options.payer, mint),
			mint: new PublicKey(mint),
			delegate: new PublicKey(options.delegate),
			owner,
			amount: options.amount,
			decimals: options.decimals,
		})
	);
	return transaction;
}

/**
 * Builds and session-signs a delegated USDC transfer (payer ATA → payee ATA,
 * authority = session delegate, fee payer = facilitator) and returns the base64
 * wire transaction with the fee-payer slot left empty for the facilitator. The
 * backend validates it, inserts the fee-payer signature, and submits it.
 */
export async function buildDelegatedTransferTx(options: {
	rpcUrl: string;
	facilitator: string;
	payer: string;
	payee: string;
	amount: string;
	sessionPublicKeyBase64: string;
	signSession: (message: Uint8Array) => Promise<Uint8Array>;
	mint?: string;
	decimals?: number;
	createPayeeAccount?: boolean;
}): Promise<string> {
	const mint = options.mint ?? SOLANA_USDC_MINT;
	const decimals = options.decimals ?? USDC_DECIMALS;
	const facilitator = new PublicKey(options.facilitator);
	const mintKey = new PublicKey(mint);
	const payerAccount = associatedTokenAddress(options.payer, mint);
	const payeeAccount = associatedTokenAddress(options.payee, mint);
	const sessionKey = new PublicKey(
		Buffer.from(options.sessionPublicKeyBase64, "base64")
	);

	const connection = createSolanaConnection(options.rpcUrl);
	const { blockhash } = await connection.getLatestBlockhash("confirmed");

	const transaction = new Transaction();
	transaction.feePayer = facilitator;
	transaction.recentBlockhash = blockhash;
	if (options.createPayeeAccount ?? true) {
		transaction.add(
			createIdempotentAtaInstruction({
				funder: facilitator,
				associatedAccount: payeeAccount,
				owner: new PublicKey(options.payee),
				mint: mintKey,
			})
		);
	}
	transaction.add(
		transferCheckedInstruction({
			source: payerAccount,
			mint: mintKey,
			destination: payeeAccount,
			authority: sessionKey,
			amount: options.amount,
			decimals,
		})
	);

	// Session-sign the message; leave the facilitator (fee-payer) slot empty.
	const message = transaction.serializeMessage();
	const signature = await options.signSession(new Uint8Array(message));
	transaction.addSignature(sessionKey, Buffer.from(signature));

	const wire = transaction.serialize({
		requireAllSignatures: false,
		verifySignatures: false,
	});
	return wire.toString("base64");
}

/** Derives the escrow per-payer nonce tracker PDA. */
function nonceTrackerAddress(payer: string): PublicKey {
	const [address] = PublicKey.findProgramAddressSync(
		[Buffer.from("nonce"), new PublicKey(payer).toBuffer()],
		new PublicKey(ESCROW_PROGRAM_ID)
	);
	return address;
}

/**
 * Reads the payer's job escrow nonce tracker and returns the next monotonic nonce
 * (last + 1), or 1 when the tracker does not exist yet (it must be initialized
 * once via the job escrow `init_nonce` instruction before the first deposit).
 */
export async function readEscrowNextNonce(
	rpcUrl: string,
	payer: string
): Promise<bigint> {
	const connection = createSolanaConnection(rpcUrl);
	const info = await connection.getAccountInfo(nonceTrackerAddress(payer));
	if (!info || info.data.length < NONCE_TRACKER_LAST_NONCE_OFFSET + 8) {
		return 1n;
	}
	const last = info.data.readBigUInt64LE(NONCE_TRACKER_LAST_NONCE_OFFSET);
	return last + 1n;
}

/**
 * Builds and session-signs a delegated job escrow deposit (`fund_for`): the
 * session delegate authorizes moving the payer's funds into the named job escrow,
 * with the facilitator as fee payer (slot left empty). The job's pinned token
 * account and mint are read on-chain so they match what the backend validates.
 * Returns the base64 wire transaction for `POST /payments/settle`.
 */
export async function buildDelegatedDepositTx(options: {
	rpcUrl: string;
	facilitator: string;
	payer: string;
	vault: string;
	amount: string;
	escrowNonce: bigint | number;
	sessionPublicKeyBase64: string;
	signSession: (message: Uint8Array) => Promise<Uint8Array>;
	payee?: string;
	expiryUnixSeconds?: number;
}): Promise<string> {
	const connection = createSolanaConnection(options.rpcUrl);
	const vaultInfo = await connection.getAccountInfo(
		new PublicKey(options.vault)
	);
	if (!vaultInfo) {
		throw new Error(`job escrow not found: ${options.vault}`);
	}
	const mint = new PublicKey(
		vaultInfo.data.subarray(VAULT_MINT_OFFSET, VAULT_MINT_OFFSET + 32)
	);
	const vaultToken = new PublicKey(
		vaultInfo.data.subarray(
			VAULT_TOKEN_ACCOUNT_OFFSET,
			VAULT_TOKEN_ACCOUNT_OFFSET + 32
		)
	);
	const payerAccount = associatedTokenAddress(options.payer, mint.toBase58());
	const sessionKey = new PublicKey(
		Buffer.from(options.sessionPublicKeyBase64, "base64")
	);
	const expiry =
		options.expiryUnixSeconds ?? Math.floor(Date.now() / 1000) + 5 * 60;

	// PaymentPayload (Borsh): amount u64, payer Pubkey, payee Pubkey, nonce u64,
	// expiry i64 — prefixed by the 8-byte Anchor discriminator.
	const data = Buffer.concat([
		Buffer.from(DEPOSIT_FOR_DISCRIMINATOR),
		Buffer.from(encodeU64LittleEndian(options.amount)),
		new PublicKey(options.payer).toBuffer(),
		new PublicKey(options.payee ?? options.payer).toBuffer(),
		Buffer.from(encodeU64LittleEndian(String(BigInt(options.escrowNonce)))),
		Buffer.from(encodeU64LittleEndian(String(expiry))),
	]);

	const instruction = new TransactionInstruction({
		programId: new PublicKey(ESCROW_PROGRAM_ID),
		keys: [
			{
				pubkey: new PublicKey(options.vault),
				isSigner: false,
				isWritable: true,
			},
			{
				pubkey: nonceTrackerAddress(options.payer),
				isSigner: false,
				isWritable: true,
			},
			{ pubkey: sessionKey, isSigner: true, isWritable: false },
			{ pubkey: payerAccount, isSigner: false, isWritable: true },
			{ pubkey: vaultToken, isSigner: false, isWritable: true },
			{
				pubkey: new PublicKey(SOLANA_TOKEN_PROGRAM_ID),
				isSigner: false,
				isWritable: false,
			},
		],
		data,
	});

	const transaction = new Transaction();
	transaction.feePayer = new PublicKey(options.facilitator);
	transaction.recentBlockhash = (
		await connection.getLatestBlockhash("confirmed")
	).blockhash;
	transaction.add(instruction);

	const message = transaction.serializeMessage();
	const signature = await options.signSession(new Uint8Array(message));
	transaction.addSignature(sessionKey, Buffer.from(signature));

	const wire = transaction.serialize({
		requireAllSignatures: false,
		verifySignatures: false,
	});
	return wire.toString("base64");
}
