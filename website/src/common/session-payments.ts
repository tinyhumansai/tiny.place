import { PublicKey, type Transaction } from "@solana/web3.js";
import {
	buildX402PaymentAuthorization,
	SOLANA_MAINNET_NETWORK,
	type TinyPlaceClient,
	type X402SettleResponse,
} from "@tinyhumansai/tinyplace";

import { createClient } from "@src/common/api-client";
import {
	createSolanaConnection,
	primarySolanaRpcUrl,
} from "@src/common/solana-rpc";
import {
	buildApproveTransaction,
	buildDelegatedDepositTx,
	buildDelegatedTransferTx,
	buildPayAiExactTransferTx,
	readDelegateAllowance,
	readEscrowNextNonce,
	resolveSplAsset,
} from "@src/common/delegated-payment";
import type { SessionWalletSigner } from "@src/common/session-wallet";

// SPL delegate cap granted on the first payment (100 USDC, 6-decimal base
// units) — matches the session grant budget so later payments up to the cap
// need no re-approval.
const SPL_DELEGATE_CAP = "100000000";

/** The x402 metadata key that carries the session-signed delegated wire tx. */
export const X402_DELEGATED_TX_METADATA_KEY = "delegatedTx";

/**
 * Whether the active facilitator backend is PayAI (mirrors the backend's
 * TINYPLACE_FACILITATOR_BACKEND). PayAI requires the strict "exact" transaction
 * shape and pre-approved session delegates.
 */
function isPayAiBackend(): boolean {
	return (
		(
			process.env["NEXT_PUBLIC_FACILITATOR_BACKEND"] ?? "local"
		).toLowerCase() === "payai"
	);
}

function isDelegatableSolanaSpl(fields: {
	to: string;
	amount: string;
	asset?: string;
	network?: string;
}): boolean {
	if (fields.network && !fields.network.toLowerCase().startsWith("solana")) {
		return false;
	}
	// Only SPL assets we can resolve to a mint settle via the delegated path:
	// USDC, or CASH when its mint is configured. Native SOL is excluded (the
	// PayAI facilitator cannot settle it).
	if (!resolveSplAsset(fields.asset)) {
		return false;
	}
	return Boolean(fields.amount) && Boolean(fields.to);
}

function isBase58Address(value: string): boolean {
	try {
		// Throws for @handles or otherwise non-base58 recipients.
		void new PublicKey(value);
		return true;
	} catch {
		return false;
	}
}

/**
 * Builds the base64, session-signed delegated transfer for an x402 challenge so
 * the payer's OWN funds move to the recipient (the facilitator only fee-pays),
 * to be carried as `metadata.delegatedTx` in the payment map. On the first
 * payment — when the session key is not yet an SPL delegate of the payer's USDC
 * — it folds in a gasless, owner-signed ApproveChecked.
 *
 * Returns undefined when the payment is not a delegatable Solana USDC transfer
 * to a base58 recipient (e.g. an @handle recipient, or a non-USDC asset), so the
 * caller keeps its existing behavior for those.
 */
export async function buildDelegatedTxForPaymentMap(
	signer: SessionWalletSigner,
	fields: {
		from: string;
		to: string;
		amount: string;
		asset?: string;
		network?: string;
	}
): Promise<string | undefined> {
	if (!isDelegatableSolanaSpl(fields)) {
		return undefined;
	}
	if (!isBase58Address(fields.to) || !isBase58Address(fields.from)) {
		return undefined;
	}
	const asset = resolveSplAsset(fields.asset);
	if (!asset) {
		return undefined;
	}

	const rpcUrl = primarySolanaRpcUrl();
	const { mint, decimals } = asset;
	const client = createClient(signer);
	const facilitator = (await client.payments.facilitator()).address;
	const payer = fields.from;
	const sessionPublicKeyBase64 = signer.publicKeyBase64;

	// PayAI's exact scheme forbids ApproveChecked and create-ATA in the payment
	// transaction, so the session delegate must already be approved (done once at
	// login) and the payee ATA must exist. Build the strict 3-instruction tx.
	if (isPayAiBackend()) {
		return buildPayAiExactTransferTx({
			rpcUrl,
			facilitator,
			payer,
			payee: fields.to,
			amount: fields.amount,
			sessionPublicKeyBase64,
			signSession: (message: Uint8Array): Promise<Uint8Array> =>
				signer.sign(message),
			mint,
			decimals,
		});
	}

	const sessionAddress = new PublicKey(
		Buffer.from(sessionPublicKeyBase64, "base64")
	).toBase58();

	const need = BigInt(fields.amount);
	const allowance = await readDelegateAllowance({
		rpcUrl,
		owner: payer,
		delegate: sessionAddress,
		mint,
	});
	const approve =
		allowance >= need
			? undefined
			: {
					allowance:
						BigInt(SPL_DELEGATE_CAP) >= need ? SPL_DELEGATE_CAP : fields.amount,
					signOwner: (message: Uint8Array): Promise<Uint8Array> =>
						signer.walletSigner.sign(message),
				};

	return buildDelegatedTransferTx({
		rpcUrl,
		facilitator,
		payer,
		payee: fields.to,
		amount: fields.amount,
		sessionPublicKeyBase64,
		signSession: (message: Uint8Array): Promise<Uint8Array> =>
			signer.sign(message),
		mint,
		decimals,
		approve,
	});
}

type SignTransactionFunction = (
	transaction: Transaction
) => Promise<Transaction>;

/**
 * One-time at login: the wallet (Phantom) approves the browser session key as an
 * SPL delegate for up to `amount` of the mint (USDC). After this, the session
 * key can authorize payments up to the cap with no further wallet prompts; the
 * facilitator fee-pays each one. Returns the approval transaction signature.
 */
export async function enableDelegatedSpending(options: {
	rpcUrl: string;
	payer: string;
	delegate: string;
	amount: string;
	mint?: string;
	signTransaction: SignTransactionFunction;
}): Promise<string> {
	const transaction = await buildApproveTransaction({
		rpcUrl: options.rpcUrl,
		payer: options.payer,
		delegate: options.delegate,
		amount: options.amount,
		mint: options.mint,
	});
	const signed = await options.signTransaction(transaction);
	const connection = createSolanaConnection(options.rpcUrl);
	const signature = await connection.sendRawTransaction(signed.serialize());
	await connection.confirmTransaction(signature, "confirmed");
	return signature;
}

export interface SessionPaymentOptions {
	rpcUrl: string;
	amount: string;
	asset?: string;
	/** Direct-pay recipient (base58). Required unless `escrowVault` is set. */
	to?: string;
	/** When set, deposit into this escrow vault instead of paying a recipient. */
	escrowVault?: string;
	/** Recorded payee for an escrow deposit (defaults to the payer). */
	payee?: string;
}

/**
 * Per payment (no wallet prompt): build and session-sign the delegated transfer
 * (direct pay) or escrow deposit, then settle it through the facilitator, which
 * adds the fee-payer signature and submits. The payer's own funds move via the
 * session-wallet delegate.
 */
export async function payViaSessionDelegate(
	client: TinyPlaceClient,
	signer: SessionWalletSigner,
	options: SessionPaymentOptions
): Promise<X402SettleResponse> {
	const facilitatorInfo = await client.payments.facilitator();
	const facilitator = facilitatorInfo.address;
	const payer = signer.agentId;
	const sessionPublicKeyBase64 = signer.publicKeyBase64;
	const signSession = (message: Uint8Array): Promise<Uint8Array> =>
		Promise.resolve(signer.sign(message));

	const metadata: Record<string, string> = { ...signer.x402PaymentMetadata() };
	let delegatedTx: string;
	let recipient: string;
	if (options.escrowVault) {
		const escrowNonce = await readEscrowNextNonce(options.rpcUrl, payer);
		delegatedTx = await buildDelegatedDepositTx({
			rpcUrl: options.rpcUrl,
			facilitator,
			payer,
			vault: options.escrowVault,
			amount: options.amount,
			escrowNonce,
			sessionPublicKeyBase64,
			signSession,
			payee: options.payee,
		});
		metadata["escrowVault"] = options.escrowVault;
		recipient = options.payee ?? payer;
	} else {
		if (!options.to) {
			throw new Error(
				"payViaSessionDelegate requires `to` for a direct transfer"
			);
		}
		const asset = resolveSplAsset(options.asset);
		if (!asset) {
			throw new Error(
				`payViaSessionDelegate: unsupported asset ${options.asset ?? "USDC"} (SPL only)`
			);
		}
		if (isPayAiBackend()) {
			delegatedTx = await buildPayAiExactTransferTx({
				rpcUrl: options.rpcUrl,
				facilitator,
				payer,
				payee: options.to,
				amount: options.amount,
				sessionPublicKeyBase64,
				signSession,
				mint: asset.mint,
				decimals: asset.decimals,
			});
		} else {
			delegatedTx = await buildDelegatedTransferTx({
				rpcUrl: options.rpcUrl,
				facilitator,
				payer,
				payee: options.to,
				amount: options.amount,
				sessionPublicKeyBase64,
				signSession,
				mint: asset.mint,
				decimals: asset.decimals,
			});
		}
		recipient = options.to;
	}

	const payment = await buildX402PaymentAuthorization(signer, {
		scheme: "exact",
		network: SOLANA_MAINNET_NETWORK,
		asset: options.asset ?? "USDC",
		amount: options.amount,
		from: payer,
		to: recipient,
		expiresInMs: 5 * 60 * 1000,
		metadata,
	});

	return client.payments.settle({ payment, delegatedTx });
}
