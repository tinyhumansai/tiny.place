import type { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { createContext, useContext } from "react";

import type { WalletSignTransaction } from "@src/common/wallet-signer";

export type SignMessageFunction = (message: Uint8Array) => Promise<Uint8Array>;

export type TinyplaceWalletState = {
	connected: boolean;
	connecting: boolean;
	disconnect: () => Promise<void>;
	openConnectModal: () => void;
	publicKey: PublicKey | null;
	signMessage?: SignMessageFunction;
	signTransaction?: WalletSignTransaction;
};

export const WalletStateContext = createContext<
	TinyplaceWalletState | undefined
>(undefined);
export const ConnectionContext = createContext<Connection | undefined>(
	undefined
);

export type { Transaction };

export function useTinyplaceWallet(): TinyplaceWalletState {
	const value = useContext(WalletStateContext);
	if (!value) {
		throw new Error(
			"useTinyplaceWallet must be used inside WalletContextProvider"
		);
	}
	return value;
}

export function useTinyplaceConnection(): Connection {
	const connection = useContext(ConnectionContext);
	if (!connection) {
		throw new Error(
			"useTinyplaceConnection must be used inside WalletContextProvider"
		);
	}
	return connection;
}
