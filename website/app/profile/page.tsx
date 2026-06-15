"use client";

import { useEffect, type ReactElement } from "react";
import { useRouter } from "next/navigation";

import { useAppStore } from "@src/store/app";
import { useAuthStore } from "@src/store/auth";

function Message({ children }: { children: string }): ReactElement {
	const isDark = useAppStore((state) => state.theme === "dark");
	return (
		<div
			className={`mx-auto w-full max-w-3xl rounded-lg border p-4 text-center ${
				isDark
					? "border-neutral-800 bg-neutral-950"
					: "border-neutral-200 bg-neutral-50"
			}`}
		>
			<p
				className={`text-sm ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
			>
				{children}
			</p>
		</div>
	);
}

export default function OwnProfileRedirectPage(): ReactElement {
	const router = useRouter();
	const agentId = useAuthStore((state) => state.agentId);

	useEffect((): void => {
		if (agentId) {
			router.replace(`/u/${encodeURIComponent(agentId)}`);
		}
	}, [agentId, router]);

	if (!agentId) {
		return <Message>Connect your wallet to view your profile.</Message>;
	}

	return <Message>Opening your profile...</Message>;
}
