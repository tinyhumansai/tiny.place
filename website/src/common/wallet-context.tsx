"use client";

import { Connection } from "@solana/web3.js";
import dynamic from "next/dynamic";
import { useMemo, type ReactNode } from "react";

import type { FunctionComponent } from "@src/common/types";
import { useHydrated } from "@src/common/use-hydrated";
import {
	primarySolanaRpcUrl,
	solanaConnectionConfig,
} from "@src/common/solana-rpc";
import {
	ConnectionContext,
	WalletStateContext,
	type TinyplaceWalletState,
} from "@src/common/tinyplace-wallet";

// The Phantom-backed provider statically imports `@phantom/react-sdk` (the
// browser-only wallet adapter), so it is loaded via a no-SSR dynamic import:
// the wallet SDK is never evaluated on the server or pulled into the server
// bundle, while this module — and the page content it wraps — stays
// server-renderable for SEO.
const PhantomBackedProvider = dynamic(
	() => import("./wallet-phantom").then((m) => m.PhantomBackedProvider),
	{ ssr: false }
);

type WalletContextProviderProperties = {
	children: ReactNode;
};

// Signed-out wallet state served during SSR and the first client paint, before
// the Phantom SDK (which requires the browser) mounts. Keeping a real provider
// in the tree — rather than leaving the context undefined — lets every public
// component render server-side without `useTinyplaceWallet()` throwing, so page
// content lands in the initial HTML for crawlers.
const SIGNED_OUT_WALLET: TinyplaceWalletState = {
	connected: false,
	connecting: false,
	disconnect: async (): Promise<void> => {},
	openConnectModal: (): void => {},
	publicKey: null,
};

export const WalletContextProvider = ({
	children,
}: WalletContextProviderProperties): FunctionComponent => {
	const endpoint = useMemo(() => primarySolanaRpcUrl(), []);
	const connectionConfig = useMemo(() => solanaConnectionConfig(), []);
	const connection = useMemo(
		() => new Connection(endpoint, connectionConfig),
		[connectionConfig, endpoint]
	);

	// Defer the Phantom SDK to the client. On the server and the first paint we
	// render `children` with a signed-out wallet context, then swap in the real
	// Phantom-backed provider once hydrated. The Solana connection is SSR-safe,
	// so `ConnectionContext` is provided in both branches.
	const mounted = useHydrated();

	if (!mounted) {
		return (
			<ConnectionContext.Provider value={connection}>
				<WalletStateContext.Provider value={SIGNED_OUT_WALLET}>
					{children}
				</WalletStateContext.Provider>
			</ConnectionContext.Provider>
		);
	}

	return (
		<ConnectionContext.Provider value={connection}>
			<PhantomBackedProvider>{children}</PhantomBackedProvider>
		</ConnectionContext.Provider>
	);
};
