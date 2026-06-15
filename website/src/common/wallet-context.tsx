"use client";

import {
	ConnectionProvider,
	WalletProvider,
	useWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import type { Adapter } from "@solana/wallet-adapter-base";
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";

import type { FunctionComponent } from "@src/common/types";
import { createClient } from "@src/common/api-client";
import { SessionWalletSigner } from "@src/common/session-wallet";
import { setSessionInvalidHandler } from "@src/common/session-recovery";
import {
	primarySolanaRpcUrl,
	solanaConnectionConfig,
} from "@src/common/solana-rpc";
import { WalletSigner } from "@src/common/wallet-signer";
import { useAuthStore } from "@src/store/auth";

import "@solana/wallet-adapter-react-ui/styles.css";

const WalletAuthSync = (): null => {
	const { connected, publicKey, signMessage } = useWallet();
	const setSigner = useAuthStore((state) => state.setSigner);
	const clearSession = useAuthStore((state) => state.clearSession);

	// Serialize establishment: one in-flight attempt at a time, and a short
	// cooldown so a burst of 401s can't prompt the wallet repeatedly. The active
	// wallet id guards against a stale attempt resolving after a disconnect.
	const inFlight = useRef<Promise<void> | null>(null);
	const lastAttemptMs = useRef(0);
	const activeWalletId = useRef<string | undefined>(undefined);

	const establish = useCallback(
		(throttle: boolean): void => {
			if (!(connected && publicKey && signMessage)) return;
			if (inFlight.current) return;
			const now = Date.now();
			if (throttle && now - lastAttemptMs.current < 5_000) return;
			lastAttemptMs.current = now;

			const publicKeyBytes = publicKey.toBytes();
			const walletId = publicKey.toBase58();
			// Restore a persisted hot session wallet — or, if none is valid, approve
			// a fresh one with a single wallet signature. Once established, the
			// in-memory session key signs everything afterwards. If the user declines
			// the approval (or it fails), fall back to the direct WalletSigner, which
			// still works but prompts the wallet per request.
			inFlight.current = SessionWalletSigner.restoreOrEstablish(
				publicKeyBytes,
				signMessage,
				createClient
			)
				.then((signer) => {
					if (activeWalletId.current !== walletId) return;
					// The session key signs routine calls, but registration must be
					// signed by the wallet (grantor), whose key derives the cryptoId.
					setSigner(signer, signer.agentId, signer.walletSigner);
				})
				.catch(() => {
					if (activeWalletId.current !== walletId) return;
					const fallback = new WalletSigner(publicKeyBytes, signMessage);
					setSigner(fallback, fallback.agentId);
				})
				.finally(() => {
					inFlight.current = null;
				});
		},
		[connected, publicKey, signMessage, setSigner]
	);

	useEffect(() => {
		if (!(connected && publicKey && signMessage)) {
			activeWalletId.current = undefined;
			clearSession();
			return;
		}
		activeWalletId.current = publicKey.toBase58();
		establish(false);
	}, [connected, publicKey, signMessage, clearSession, establish]);

	// Re-establish when the backend rejects the session mid-use (revoked or
	// expired grant surfaced as a 401/403 via the API client).
	useEffect(() => {
		setSessionInvalidHandler(() => {
			establish(true);
		});
		return (): void => {
			setSessionInvalidHandler(undefined);
		};
	}, [establish]);

	return null;
};

type WalletContextProviderProperties = {
	children: ReactNode;
};

export const WalletContextProvider = ({
	children,
}: WalletContextProviderProperties): FunctionComponent => {
	const endpoint = useMemo(() => primarySolanaRpcUrl(), []);
	const connectionConfig = useMemo(() => solanaConnectionConfig(), []);
	// Phantom (and other modern wallets) register themselves as Standard Wallets
	// and are auto-detected, so no explicit adapter is needed — passing one makes
	// the adapter warn that it can be removed.
	const wallets = useMemo<Array<Adapter>>(() => [], []);

	return (
		<ConnectionProvider config={connectionConfig} endpoint={endpoint}>
			<WalletProvider autoConnect wallets={wallets}>
				<WalletModalProvider>
					<WalletAuthSync />
					{children}
				</WalletModalProvider>
			</WalletProvider>
		</ConnectionProvider>
	);
};
