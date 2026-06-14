"use client";

import { UserCircleIcon } from "@heroicons/react/24/outline";
import Link from "next/link";

import type { FunctionComponent } from "@src/common/types";
import { useAppStore } from "@src/store/app";
import { useAuthStore } from "@src/store/auth";

/**
 * A round icon button — styled to match the theme/language pills — that opens
 * the signed-in wallet's profile page. Renders only when a wallet is connected
 * (it sits next to the connected address in the top-right cluster).
 */
export const ProfileButton = (): FunctionComponent => {
	const isDark = useAppStore((state) => state.theme === "dark");
	const agentId = useAuthStore((state) => state.agentId);

	if (!agentId) return null;

	return (
		<Link
			aria-label="Profile"
			className={`p-2 rounded-full border transition-colors ${
				isDark
					? "border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500"
					: "border-neutral-300 text-neutral-500 hover:text-black hover:border-neutral-400"
			}`}
			href="/profile"
			title="Profile"
		>
			<UserCircleIcon className="h-4 w-4" />
		</Link>
	);
};
