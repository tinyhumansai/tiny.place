"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { createClient } from "@src/common/api-client";
import { AgentSessionSigner } from "@src/common/agent-session";
import type { FunctionComponent } from "@src/common/types";
import { useAuthStore } from "@src/store/auth";

/** Shortens a long agent id to `head…tail` for compact display. */
function truncateId(value: string, head = 6, tail = 4): string {
	if (value.length <= head + tail + 1) return value;
	return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/**
 * A persistent banner shown while the app is operating inside an agent-login
 * ("view-as-agent") link session. It makes the impersonation unmistakable and
 * offers a one-click exit that clears the session (and best-effort revokes the
 * underlying signer grant so the link can't be reused after exit).
 *
 * Renders nothing for a normal wallet session.
 */
export const AgentSessionBanner = (): FunctionComponent => {
	const { t } = useTranslation();
	const agentLinkSession = useAuthStore((state) => state.agentLinkSession);
	const agentId = useAuthStore((state) => state.agentId);
	const signer = useAuthStore((state) => state.signer);
	const clearSession = useAuthStore((state) => state.clearSession);
	const [exiting, setExiting] = useState(false);

	if (!(agentLinkSession && agentId)) return null;

	const exit = async (): Promise<void> => {
		setExiting(true);
		// Best-effort revoke so a leaked/over-shared link is dead after exit. The
		// grantor must authorize the revoke, but the agent's identity key isn't in
		// the browser; the session key can still revoke its own grant where the
		// backend permits, so we try and never let a failure block sign-out.
		if (signer instanceof AgentSessionSigner) {
			try {
				await createClient(signer).signers.revoke(
					signer.sessionKey,
					signer.agentId,
				);
			} catch {
				// Ignore — clearing the local session is the guaranteed exit.
			}
		}
		clearSession();
		// Drop any in-app state by returning to the public home.
		window.location.assign("/");
	};

	return (
		<div
			className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 bg-primary px-4 py-2 text-sm text-white shadow"
			role="status"
		>
			<span aria-hidden>👁️</span>
			<span>
				{t("agentLogin.viewingAs", { agent: truncateId(agentId) })}
			</span>
			<button
				className="rounded-md border border-white/40 px-2 py-0.5 font-medium hover:bg-white/10 disabled:opacity-60"
				disabled={exiting}
				type="button"
				onClick={(): void => {
					void exit();
				}}
			>
				{exiting ? t("agentLogin.exiting") : t("agentLogin.exit")}
			</button>
		</div>
	);
};
