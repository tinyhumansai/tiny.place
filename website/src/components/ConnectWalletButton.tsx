"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useTinyplaceWallet } from "@src/common/tinyplace-wallet";
import { useAppStore } from "@src/store/app";
import type { FunctionComponent } from "@src/common/types";

/** Shortens a wallet address to `head…tail` for the button label. */
function truncateAddress(address: string): string {
	if (address.length <= 9) return address;
	return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * A wallet connect button styled to match the theme + language pills. While
 * disconnected it opens Phantom's connect modal; once connected the address pill
 * opens a small account menu where the viewer can open their profile or log out.
 */
export const ConnectWalletButton = (): FunctionComponent => {
	const wallet = useTinyplaceWallet();
	const isDark = useAppStore((state) => state.theme === "dark");
	const router = useRouter();
	const [menuOpen, setMenuOpen] = useState(false);

	const address = wallet.publicKey?.toBase58();
	const label = wallet.connecting
		? "Connecting…"
		: wallet.connected && address
			? truncateAddress(address)
			: "Connect";

	const onClick = (): void => {
		if (wallet.connected) {
			setMenuOpen(true);
		} else {
			wallet.openConnectModal();
		}
	};

	// Primary (blue) call-to-action while disconnected; once connected the
	// button shows the address / opens the account menu, so it drops to a subtle
	// pill.
	const className = wallet.connected
		? `px-3 py-1.5 rounded-full border text-sm transition-colors ${
				isDark
					? "border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500"
					: "border-neutral-300 text-neutral-500 hover:text-black hover:border-neutral-400"
			}`
		: "px-3 py-1.5 rounded-full bg-blue-600 text-sm font-medium text-white transition-colors hover:bg-blue-500";

	const openProfile = (): void => {
		setMenuOpen(false);
		router.push("/profile");
	};

	const logout = (): void => {
		setMenuOpen(false);
		void wallet.disconnect();
	};

	const panelClass = isDark
		? "border-neutral-800 bg-neutral-950 text-white"
		: "border-neutral-200 bg-white text-black";
	const mutedClass = isDark ? "text-neutral-400" : "text-neutral-500";
	const itemClass = `w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
		isDark ? "hover:bg-neutral-800" : "hover:bg-neutral-100"
	}`;

	return (
		<>
			<button className={className} type="button" onClick={onClick}>
				{label}
			</button>
			{menuOpen && wallet.connected && (
				<div
					aria-modal="true"
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
					role="dialog"
					onClick={(): void => {
						setMenuOpen(false);
					}}
				>
					<div
						className={`w-full max-w-xs rounded-xl border p-4 shadow-xl ${panelClass}`}
						onClick={(event): void => {
							event.stopPropagation();
						}}
					>
						<h3 className="text-sm font-semibold">Account</h3>
						{address && (
							<p className={`mt-1 truncate text-xs ${mutedClass}`}>{address}</p>
						)}
						<div className="mt-4 flex flex-col gap-1">
							<button className={itemClass} type="button" onClick={openProfile}>
								Open profile
							</button>
							<button
								className={`${itemClass} text-rose-500`}
								type="button"
								onClick={logout}
							>
								Log out
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
};
