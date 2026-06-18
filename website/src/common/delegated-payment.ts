import {
	PublicKey,
	Transaction,
	TransactionInstruction,
} from "@solana/web3.js";
import {
	SOLANA_CASH_DECIMALS,
	SOLANA_CASH_MINT,
	SOLANA_TOKEN_PROGRAM_ID,
	SOLANA_USDC_MINT,
} from "@tinyhumansai/tinyplace";

import { createSolanaConnection } from "@src/common/solana-rpc";

/**
 * The USDC mint to settle in. Defaults to the SDK's mainnet mint but is
 * overridable via NEXT_PUBLIC_SOLANA_USDC_MINT so devnet/test stacks (which use
 * a different mint) derive the correct token accounts. Mirrors the override used
 * by use-wallet-balances.ts.
 */
export function publicUsdcMint(): string {
	return process.env["NEXT_PUBLIC_SOLANA_USDC_MINT"] ?? SOLANA_USDC_MINT;
}

/** The x402 payment-map metadata key carrying the base64 payer-signed transfer
 * transaction. The backend routes any payment bearing it to the configured
 * facilitator (CDP or PayAI), which co-signs as fee payer and broadcasts. */
export const X402_DELEGATED_TX_METADATA_KEY = "delegatedTx";

/**
 * The CASH ($1 stablecoin) mint, from NEXT_PUBLIC_SOLANA_CASH_MINT (a dev mint
 * locally, the real mint in production). Returns "" when unconfigured — CASH is
 * only offered once a mint is set, mirroring the backend's CASH_MINT gate.
 */
export function publicCashMint(): string {
	return process.env["NEXT_PUBLIC_SOLANA_CASH_MINT"] ?? SOLANA_CASH_MINT;
}

// The Associated Token Account program. Not exported by the SDK, so it is
// defined here alongside the other Solana program ids it complements.
const ASSOCIATED_TOKEN_PROGRAM_ID =
	"ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

const TOKEN_TRANSFER_CHECKED_INSTRUCTION = 12;
const USDC_DECIMALS = 6;

/**
 * Resolves an x402 asset symbol to its SPL mint + decimals for the Solana
 * settlement path. Returns undefined for assets that cannot settle as an SPL
 * TransferChecked — notably native SOL, which the facilitators (CDP/PayAI) do
 * not support. CASH resolves only when its mint is configured.
 */
export function resolveSplAsset(
	asset?: string
): { mint: string; decimals: number } | undefined {
	const symbol = (asset ?? "USDC").toUpperCase();
	if (symbol === "USDC") {
		return { mint: publicUsdcMint(), decimals: USDC_DECIMALS };
	}
	if (symbol === "CASH") {
		const mint = publicCashMint();
		return mint ? { mint, decimals: SOLANA_CASH_DECIMALS } : undefined;
	}
	return undefined;
}

// The job escrow program and its `fund_for` Anchor discriminator
// (sha256("global:fund_for")[:8]).
const ESCROW_PROGRAM_ID = "Akw97oRg5g6uMnQqkpJ6qHMpxsZCJSixZyQ1Uuitd32D";
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

// The ComputeBudget program and its instruction discriminators. The x402
// "exact" Solana scheme requires SetComputeUnitLimit then SetComputeUnitPrice as
// the first two instructions before the TransferChecked. Both CDP and PayAI cap
// the unit price at <=5_000_000 microlamports/CU; CDP additionally tolerates the
// wallet (Lighthouse) + memo instructions Phantom/Solflare append.
const COMPUTE_BUDGET_PROGRAM_ID = "ComputeBudget111111111111111111111111111111";
const COMPUTE_BUDGET_SET_UNIT_LIMIT_INSTRUCTION = 2;
const COMPUTE_BUDGET_SET_UNIT_PRICE_INSTRUCTION = 3;
const FACILITATOR_COMPUTE_UNIT_LIMIT = 40_000;
const FACILITATOR_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS = "1";

/** Encodes a value (base units) as a little-endian u32. */
function encodeU32LittleEndian(value: number): Uint8Array {
	const bytes = new Uint8Array(4);
	let remaining = value;
	for (let index = 0; index < 4; index += 1) {
		bytes[index] = remaining & 0xff;
		remaining >>>= 8;
	}
	return bytes;
}

/** ComputeBudget SetComputeUnitLimit (caps the transaction's compute units). */
function setComputeUnitLimitInstruction(units: number): TransactionInstruction {
	const data = new Uint8Array(5);
	data[0] = COMPUTE_BUDGET_SET_UNIT_LIMIT_INSTRUCTION;
	data.set(encodeU32LittleEndian(units), 1);
	return new TransactionInstruction({
		programId: new PublicKey(COMPUTE_BUDGET_PROGRAM_ID),
		keys: [],
		data: Buffer.from(data),
	});
}

/** ComputeBudget SetComputeUnitPrice (priority fee, in microlamports/CU). */
function setComputeUnitPriceInstruction(
	microLamports: string
): TransactionInstruction {
	const data = new Uint8Array(9);
	data[0] = COMPUTE_BUDGET_SET_UNIT_PRICE_INSTRUCTION;
	data.set(encodeU64LittleEndian(microLamports), 1);
	return new TransactionInstruction({
		programId: new PublicKey(COMPUTE_BUDGET_PROGRAM_ID),
		keys: [],
		data: Buffer.from(data),
	});
}

/**
 * Builds a standard x402 "exact" Solana payment: the PAYER signs the transfer
 * directly (authority = payer = the connected wallet), and the configured
 * facilitator (CDP or PayAI) is the fee payer that co-signs/broadcasts at settle
 * time. Instructions are exactly [SetComputeUnitLimit, SetComputeUnitPrice,
 * TransferChecked] — no ApproveChecked, no create-ATA (the scheme forbids them;
 * the payee ATA must already exist). The wallet partially signs via
 * `signTransaction` (which Phantom supports, unlike signMessage); the fee-payer
 * slot is left empty for the facilitator. Returns the base64 wire transaction.
 */
export async function buildPayerSignedTransferTx(options: {
	rpcUrl: string;
	feePayer: string;
	payer: string;
	payee: string;
	amount: string;
	mint: string;
	decimals: number;
	signTransaction: (transaction: Transaction) => Promise<Transaction>;
}): Promise<string> {
	const feePayer = new PublicKey(options.feePayer);
	const mintKey = new PublicKey(options.mint);
	const payer = new PublicKey(options.payer);
	const payerAccount = associatedTokenAddress(options.payer, options.mint);
	const payeeAccount = associatedTokenAddress(options.payee, options.mint);

	const connection = createSolanaConnection(options.rpcUrl);
	const { blockhash } = await connection.getLatestBlockhash("confirmed");

	const transaction = new Transaction();
	transaction.feePayer = feePayer;
	transaction.recentBlockhash = blockhash;
	transaction.add(
		setComputeUnitLimitInstruction(FACILITATOR_COMPUTE_UNIT_LIMIT)
	);
	transaction.add(
		setComputeUnitPriceInstruction(FACILITATOR_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS)
	);
	transaction.add(
		transferCheckedInstruction({
			source: payerAccount,
			mint: mintKey,
			destination: payeeAccount,
			authority: payer,
			amount: options.amount,
			decimals: options.decimals,
		})
	);

	// The wallet partially signs as the transfer authority; PayAI's fee-payer
	// slot is left empty (filled at settle time).
	const signed = await options.signTransaction(transaction);
	const wire = signed.serialize({
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
