"use client";

import {
	ConnectionProvider,
	WalletProvider,
	useWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { clusterApiUrl, type Cluster } from "@solana/web3.js";
import { useEffect, useMemo, type ReactNode } from "react";

import type { FunctionComponent } from "@src/common/types";
import { createClient } from "@src/common/api-client";
import { SessionWalletSigner } from "@src/common/session-wallet";
import { WalletSigner } from "@src/common/wallet-signer";
import { useAuthStore } from "@src/store/auth";

import "@solana/wallet-adapter-react-ui/styles.css";

const network = (process.env["NEXT_PUBLIC_SOLANA_NETWORK"] ??
	"devnet") as Cluster;

// A full RPC endpoint override (e.g. a local solana-test-validator at
// http://localhost:8899) wins over the hosted cluster derived from `network`.
// This lets the web app, backend verifier, and validator all share one chain
// for end-to-end testing. Empty string means "use the hosted cluster".
const rpcUrlOverride = process.env["NEXT_PUBLIC_SOLANA_RPC_URL"]?.trim() ?? "";

const WalletAuthSync = (): null => {
	const { connected, publicKey, signMessage } = useWallet();
	const setSigner = useAuthStore((state) => state.setSigner);
	const clearSession = useAuthStore((state) => state.clearSession);

	useEffect(() => {
		if (!(connected && publicKey && signMessage)) {
			clearSession();
			return;
		}
		let cancelled = false;
		const publicKeyBytes = publicKey.toBytes();
		// Establish a hot session wallet: one wallet signature approves an
		// in-memory session key that signs everything afterwards. If the user
		// declines the approval (or it fails), fall back to the direct
		// WalletSigner, which still works but prompts the wallet per request.
		SessionWalletSigner.establish(publicKeyBytes, signMessage, createClient())
			.then((signer) => {
				if (!cancelled) {
					// The session key signs routine calls, but registration must be
					// signed by the wallet (grantor), whose key derives the cryptoId.
					setSigner(signer, signer.agentId, signer.walletSigner);
				}
			})
			.catch(() => {
				if (!cancelled) {
					const fallback = new WalletSigner(publicKeyBytes, signMessage);
					setSigner(fallback, fallback.agentId);
				}
			});
		return (): void => {
			cancelled = true;
		};
	}, [connected, publicKey, signMessage, setSigner, clearSession]);

	return null;
};

type WalletContextProviderProperties = {
	children: ReactNode;
};

export const WalletContextProvider = ({
	children,
}: WalletContextProviderProperties): FunctionComponent => {
	const endpoint = useMemo(() => rpcUrlOverride || clusterApiUrl(network), []);
	const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

	return (
		<ConnectionProvider endpoint={endpoint}>
			<WalletProvider autoConnect wallets={wallets}>
				<WalletModalProvider>
					<WalletAuthSync />
					{children}
				</WalletModalProvider>
			</WalletProvider>
		</ConnectionProvider>
	);
};
