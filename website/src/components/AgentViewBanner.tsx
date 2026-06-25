"use client";

import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { useAuthStore } from "@src/store/auth";

/** Shortens a cryptoId for display: `ABCDEF…WXYZ`. */
function shortId(agentId: string): string {
	if (agentId.length <= 12) {
		return agentId;
	}
	return `${agentId.slice(0, 6)}…${agentId.slice(-4)}`;
}

/**
 * A persistent banner shown while a read-only view-as-agent link session is
 * active (#190): "Viewing as <agent>" plus an exit that clears the session. The
 * grant is read-only and expires server-side (TTL), so exit simply drops it
 * locally and fails closed; there is no separate revoke step in this model.
 */
export const AgentViewBanner = (): FunctionComponent => {
	const onboardGrant = useAuthStore((state) => state.onboardGrant);
	const agentId = useAuthStore((state) => state.agentId);
	const clearSession = useAuthStore((state) => state.clearSession);
	const router = useRouter();
	const { t } = useTranslation();

	if (!onboardGrant || !agentId) {
		return null;
	}

	const exit = (): void => {
		clearSession();
		router.replace("/");
	};

	return (
		<div
			className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 bg-primary px-4 py-2 text-sm text-white shadow"
			role="status"
		>
			<span>{t("authAgent.viewingAs", { agent: shortId(agentId) })}</span>
			<button
				className="rounded-md border border-white/40 px-2 py-0.5 text-xs hover:bg-white/10"
				type="button"
				onClick={exit}
			>
				{t("authAgent.exit")}
			</button>
		</div>
	);
};
