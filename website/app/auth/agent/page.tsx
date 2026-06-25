"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { createClient } from "@src/common/api-client";
import {
	restoreAgentLinkSession,
	type AgentLinkFailure,
} from "@src/common/agent-session";
import type { FunctionComponent } from "@src/common/types";
import { useAuthStore } from "@src/store/auth";

/** Where the owner lands once logged in as the agent. */
const LANDING_PATH = "/explore";

type Status =
	| { phase: "loading" }
	| { phase: "error"; reason: AgentLinkFailure | "missing" };

/**
 * Client-only callback route for agent-generated login links
 * (`https://tiny.place/auth/agent#<token>`).
 *
 * It reads the token from the URL FRAGMENT (never a query string, so the token
 * is never sent to a server/access log), strips it from the address bar/history
 * immediately, validates + reconstructs a no-wallet session signer, confirms the
 * grant is still active with the backend, and hydrates the auth store as the
 * agent — then redirects into the app. Every failure path lands in a clear
 * message and leaves NO partial auth state.
 */
export default function AgentLoginPage(): FunctionComponent {
	const router = useRouter();
	const { t } = useTranslation();
	const setLinkSession = useAuthStore((state) => state.setLinkSession);
	const [status, setStatus] = useState<Status>({ phase: "loading" });
	// Guard against the effect running twice (React 18 StrictMode double-invoke)
	// — the fragment is captured and cleared exactly once.
	const consumed = useRef(false);

	useEffect(() => {
		if (consumed.current) return;
		consumed.current = true;

		// Capture the fragment, then immediately strip it from the address bar and
		// history so the secret token cannot be re-read, copied, or back-buttoned.
		const fragment = window.location.hash;
		stripFragmentFromHistory();

		if (!fragment || fragment === "#") {
			setStatus({ phase: "error", reason: "missing" });
			return;
		}

		let cancelled = false;
		void (async (): Promise<void> => {
			const result = await restoreAgentLinkSession(fragment, (signer) =>
				createClient(signer),
			);
			if (cancelled) return;
			if (!result.ok) {
				setStatus({ phase: "error", reason: result.reason });
				return;
			}
			setLinkSession(result.signer, result.agentId);
			router.replace(LANDING_PATH);
		})();

		return (): void => {
			cancelled = true;
		};
	}, [router, setLinkSession]);

	if (status.phase === "loading") {
		return (
			<main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
				<div
					aria-hidden
					className="size-8 animate-spin rounded-full border-2 border-border border-t-primary"
				/>
				<p className="text-muted">{t("agentLogin.signingIn")}</p>
			</main>
		);
	}

	return (
		<main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
			<h1 className="text-xl font-semibold text-front">
				{t("agentLogin.failedTitle")}
			</h1>
			<p className="max-w-md text-muted">
				{t(`agentLogin.error.${status.reason}`)}
			</p>
			<button
				className="rounded-md bg-primary px-4 py-2 text-white hover:bg-primary-hover"
				onClick={(): void => router.replace("/")}
				type="button"
			>
				{t("agentLogin.backHome")}
			</button>
		</main>
	);
}

/**
 * Removes the fragment from the URL without a navigation or a new history entry,
 * so the token never lingers in the address bar or back-stack.
 */
function stripFragmentFromHistory(): void {
	try {
		const url = window.location.pathname + window.location.search;
		window.history.replaceState(null, "", url);
	} catch {
		// Best-effort: a failed strip must not block sign-in.
	}
}
