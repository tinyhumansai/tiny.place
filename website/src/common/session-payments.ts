import { Connection, type Transaction } from "@solana/web3.js";
import {
	buildX402PaymentAuthorization,
	SOLANA_MAINNET_NETWORK,
	type TinyVerseClient,
	type X402SettleResponse,
} from "@tinyhumansai/tinyplace";

import {
	buildApproveTransaction,
	buildDelegatedDepositTx,
	buildDelegatedTransferTx,
	readEscrowNextNonce,
} from "@src/common/delegated-payment";
import type { SessionWalletSigner } from "@src/common/session-wallet";

type SignTransactionFunction = (transaction: Transaction) => Promise<Transaction>;

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
	const connection = new Connection(options.rpcUrl, "confirmed");
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
	client: TinyVerseClient,
	signer: SessionWalletSigner,
	options: SessionPaymentOptions,
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
			throw new Error("payViaSessionDelegate requires `to` for a direct transfer");
		}
		delegatedTx = await buildDelegatedTransferTx({
			rpcUrl: options.rpcUrl,
			facilitator,
			payer,
			payee: options.to,
			amount: options.amount,
			sessionPublicKeyBase64,
			signSession,
		});
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
