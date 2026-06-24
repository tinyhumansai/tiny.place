import {
	ComputeBudgetProgram,
	type Connection,
	PublicKey,
	Transaction,
	TransactionInstruction,
} from "@solana/web3.js";

/** SPL Token program. */
const TOKEN_PROGRAM_ID = new PublicKey(
	"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
/** Associated Token Account program (derives a wallet's canonical token account). */
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
	"ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

/**
 * Compute budget for the facilitator transfer. The facilitator (CDP) is the fee
 * payer; these keep the transaction's compute footprint explicit and match the
 * `[SetComputeUnitLimit, SetComputeUnitPrice, TransferChecked]` shape CDP expects.
 */
const COMPUTE_UNIT_LIMIT = 40_000;
const COMPUTE_UNIT_PRICE_MICRO_LAMPORTS = 1;

/** TransferChecked SPL instruction discriminator. */
const TRANSFER_CHECKED_DISCRIMINATOR = 12;

/** A wallet adapter's partial-signing function (signs as the payer/owner only). */
export type SignTransactionFunction = (
	transaction: Transaction
) => Promise<Transaction>;

export interface DelegatedTransferOptions {
	connection: Connection;
	/** The wallet that owns the source token account and authorizes the transfer. */
	payer: PublicKey;
	/** The facilitator's fee payer (CDP), set as the transaction fee payer. */
	feePayer: PublicKey;
	/** SPL mint of the asset being transferred (e.g. USDC). */
	mint: PublicKey;
	/** Mint decimals (USDC/CASH = 6). */
	decimals: number;
	/** Transfer amount in the asset's minor units. */
	amount: bigint;
	/** The recipient wallet (treasury) whose canonical token account receives funds. */
	treasury: PublicKey;
	/** The wallet adapter's signTransaction (Phantom/Solflare). */
	signTransaction: SignTransactionFunction;
}

/** Derive the canonical associated token account for (owner, mint). */
function associatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
	const [address] = PublicKey.findProgramAddressSync(
		[owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
		ASSOCIATED_TOKEN_PROGRAM_ID
	);
	return address;
}

/** Build a TransferChecked instruction (no @solana/spl-token dependency). */
function transferCheckedInstruction(options: {
	source: PublicKey;
	mint: PublicKey;
	destination: PublicKey;
	owner: PublicKey;
	amount: bigint;
	decimals: number;
}): TransactionInstruction {
	const data = new Uint8Array(10);
	data[0] = TRANSFER_CHECKED_DISCRIMINATOR;
	new DataView(data.buffer).setBigUint64(1, options.amount, true);
	data[9] = options.decimals;
	return new TransactionInstruction({
		programId: TOKEN_PROGRAM_ID,
		keys: [
			{ pubkey: options.source, isSigner: false, isWritable: true },
			{ pubkey: options.mint, isSigner: false, isWritable: false },
			{ pubkey: options.destination, isSigner: false, isWritable: true },
			{ pubkey: options.owner, isSigner: true, isWritable: false },
		],
		data: Buffer.from(data),
	});
}

/**
 * Build the standard x402 Solana "exact" payment: a partially-signed
 * `[SetComputeUnitLimit, SetComputeUnitPrice, TransferChecked]` transaction whose
 * fee payer is the facilitator (CDP). The payer's wallet signs (its own USDC
 * moves) but the transaction is NOT broadcast — the server forwards it to CDP
 * `/settle`, which co-signs as fee payer and broadcasts. Returns the base64
 * serialized transaction to carry as `payment.metadata.delegatedTx`.
 */
export async function buildDelegatedTransfer(
	options: DelegatedTransferOptions
): Promise<string> {
	const source = associatedTokenAddress(options.payer, options.mint);
	const destination = associatedTokenAddress(options.treasury, options.mint);
	const { blockhash } = await options.connection.getLatestBlockhash("confirmed");

	const transaction = new Transaction();
	transaction.feePayer = options.feePayer;
	transaction.recentBlockhash = blockhash;
	transaction.add(
		ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNIT_LIMIT }),
		ComputeBudgetProgram.setComputeUnitPrice({
			microLamports: COMPUTE_UNIT_PRICE_MICRO_LAMPORTS,
		}),
		transferCheckedInstruction({
			source,
			mint: options.mint,
			destination,
			owner: options.payer,
			amount: options.amount,
			decimals: options.decimals,
		})
	);

	const signed = await options.signTransaction(transaction);
	// requireAllSignatures: false — the facilitator's fee-payer signature is added
	// server-side by CDP. verifySignatures: false for the same reason.
	const serialized = signed.serialize({
		requireAllSignatures: false,
		verifySignatures: false,
	});
	return Buffer.from(serialized).toString("base64");
}
