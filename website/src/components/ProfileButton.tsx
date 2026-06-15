"use client";

import { UserCircleIcon } from "@heroicons/react/24/outline";
import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";

import type { FunctionComponent } from "@src/common/types";

/**
 * A round icon button — styled to match the theme/language pills — that opens
 * the signed-in wallet's profile page. Renders only when a wallet is connected
 * (it sits next to the connected address in the top-right cluster).
 */
export const ProfileButton = (): FunctionComponent => {
	const { publicKey } = useWallet();

	if (!publicKey) return null;

	return (
		<Link
			aria-label="Profile"
			className="rounded-full border border-border-strong p-2 text-muted transition-colors hover:border-primary hover:text-front"
			href="/profile"
			title="Profile"
		>
			<UserCircleIcon className="h-4 w-4" />
		</Link>
	);
};
