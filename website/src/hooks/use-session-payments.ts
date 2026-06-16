import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import type { X402SettleResponse } from "@tinyhumansai/tinyplace";
import { useCallback, useMemo } from "react";

import { createClient } from "@src/common/api-client";
import {
	SessionWalletSigner,
	enableDelegatedSpending,
	payViaSessionDelegate,
	type SessionPaymentOptions,
} from "@src/common/auth-payment";
import { primarySolanaRpcUrl } from "@src/common/solana-rpc";
import { useAuthStore } from "@src/store/auth";

interface UseSessionPayments {
	/** True when a session wallet + a connected wallet that can sign txs exist. */
	ready: boolean;
	/**
	 * One-time: prompt the wallet to approve the session key as an SPL delegate
	 * for up to `amount` of `mint` (USDC by default). Returns the approval tx
	 * signature. After this, {@link pay} needs no wallet prompt.
	 */
	enableSpending: (amount: string, mint?: string) => Promise<string>;
	/**
	 * Make a delegated payment (direct transfer or escrow deposit) with no wallet
	 * prompt: the session key authorizes it and the facilitator fee-pays.
	 */
	pay: (
		options: Omit<SessionPaymentOptions, "rpcUrl">
	) => Promise<X402SettleResponse>;
}

/**
 * Bridges the delegated-payment helpers to the auth store and wallet adapter:
 * the browser session key (from the auth store) authorizes payments, while the
 * connected wallet signs the one-time on-chain `approve`.
 */
export function useSessionPayments(): UseSessionPayments {
	const signer = useAuthStore((state) => state.signer);
	const { publicKey, signTransaction } = useWallet();
	const session = signer instanceof SessionWalletSigner ? signer : undefined;
	const ready = Boolean(session && publicKey && signTransaction);

	const enableSpending = useCallback(
		async (amount: string, mint?: string): Promise<string> => {
			if (!session || !publicKey || !signTransaction) {
				throw new Error("connect a wallet with an active session first");
			}
			const delegate = new PublicKey(
				Buffer.from(session.publicKeyBase64, "base64")
			).toBase58();
			return enableDelegatedSpending({
				rpcUrl: primarySolanaRpcUrl(),
				payer: publicKey.toBase58(),
				delegate,
				amount,
				mint,
				signTransaction,
			});
		},
		[session, publicKey, signTransaction]
	);

	const pay = useCallback(
		async (
			options: Omit<SessionPaymentOptions, "rpcUrl">
		): Promise<X402SettleResponse> => {
			if (!session) {
				throw new Error("no active session wallet");
			}
			const client = createClient(session);
			return payViaSessionDelegate(client, session, {
				...options,
				rpcUrl: primarySolanaRpcUrl(),
			});
		},
		[session]
	);

	return useMemo(
		() => ({ ready, enableSpending, pay }),
		[ready, enableSpending, pay]
	);
}
