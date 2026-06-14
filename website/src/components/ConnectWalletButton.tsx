"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

import { useAppStore } from "@src/store/app";
import type { FunctionComponent } from "@src/common/types";

/** Shortens a wallet address to `head…tail` for the button label. */
function truncateAddress(address: string): string {
	if (address.length <= 9) return address;
	return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * A wallet connect/disconnect button styled to match the theme + language pills.
 * The Solana wallet adapter handles only the web3 side: `useWalletModal` opens
 * the wallet picker, `useWallet` exposes connection state and disconnect. We
 * render our own uniform UI instead of the adapter's `WalletMultiButton`.
 */
export const ConnectWalletButton = (): FunctionComponent => {
	// Keep the wallet object (rather than destructuring `disconnect`) so the
	// method stays bound to it when invoked.
	const wallet = useWallet();
	const { setVisible } = useWalletModal();
	const isDark = useAppStore((state) => state.theme === "dark");

	const address = wallet.publicKey?.toBase58();
	const label = wallet.connecting
		? "Connecting…"
		: wallet.connected && address
			? truncateAddress(address)
			: "Connect";

	const onClick = (): void => {
		if (wallet.connected) {
			void wallet.disconnect();
		} else {
			setVisible(true);
		}
	};

	// Primary (blue) call-to-action while disconnected; once connected the
	// button shows the address / acts as disconnect, so it drops to a subtle pill.
	const className = wallet.connected
		? `px-3 py-1.5 rounded-full border text-sm transition-colors ${
				isDark
					? "border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500"
					: "border-neutral-300 text-neutral-500 hover:text-black hover:border-neutral-400"
			}`
		: "px-3 py-1.5 rounded-full bg-blue-600 text-sm font-medium text-white transition-colors hover:bg-blue-500";
	const title =
		wallet.connected && address
			? `${address} — click to disconnect`
			: undefined;

	return (
		<button className={className} title={title} type="button" onClick={onClick}>
			{label}
		</button>
	);
};
