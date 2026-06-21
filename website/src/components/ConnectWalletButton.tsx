"use client";

import { useTranslation } from "react-i18next";

import { useTinyplaceWallet } from "@src/common/tinyplace-wallet";
import { useAppStore } from "@src/store/app";
import type { FunctionComponent } from "@src/common/types";

/** Shortens a wallet address to `head…tail` for the button label. */
function truncateAddress(address: string): string {
	if (address.length <= 9) return address;
	return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * A wallet connect/disconnect button styled to match the theme + language pills.
 * Phantom SDK handles the web3 side; we render our own uniform UI instead of
 * Phantom's stock `ConnectButton`.
 */
export const ConnectWalletButton = (): FunctionComponent => {
	const { t } = useTranslation();
	const wallet = useTinyplaceWallet();
	const isDark = useAppStore((state) => state.theme === "dark");

	const address = wallet.publicKey?.toBase58();
	const label = wallet.connecting
		? t("common.connecting")
		: wallet.connected && address
			? truncateAddress(address)
			: t("wallet.connect");

	const onClick = (): void => {
		if (wallet.connected) {
			void wallet.disconnect();
		} else {
			wallet.openConnectModal();
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
			? t("wallet.disconnectHint", { address })
			: undefined;

	return (
		<button className={className} title={title} type="button" onClick={onClick}>
			{label}
		</button>
	);
};
