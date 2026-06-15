"use client";

import { useEffect, type ReactElement } from "react";
import { useRouter } from "next/navigation";

import { useAuthStore } from "@src/store/auth";

function Message({ children }: { children: string }): ReactElement {
	return (
		<div className="theme-surface-card mx-auto w-full max-w-3xl rounded-lg border p-4 text-center">
			<p className="text-sm text-muted">{children}</p>
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
