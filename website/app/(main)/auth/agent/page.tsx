"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
	readGrantFragment,
	resolveAgentViewGrant,
} from "@src/common/agent-view-session";
import { createClient } from "@src/common/api-client";
import type { FunctionComponent } from "@src/common/types";
import { useAuthStore } from "@src/store/auth";

/**
 * `/auth/agent` — the view-as-agent callback (#190). An agent hands its owner a
 * `https://tiny.place/auth/agent#grant=<token>` link; opening it logs the owner
 * in as the agent under a read-only `session.view` grant, with no wallet and no
 * private key. The token rides in the URL fragment and is stripped immediately;
 * malformed/expired/revoked tokens fail closed with no partial auth state.
 */
export default function AgentAuthPage(): FunctionComponent {
	const router = useRouter();
	const { t } = useTranslation();
	const setLinkSession = useAuthStore((state) => state.setLinkSession);
	const [error, setError] = useState<string | undefined>(undefined);

	useEffect(() => {
		let active = true;

		const raw = readGrantFragment(window.location.hash);
		// Strip the token from the address bar/history before anything else, so it
		// is never left visible or re-shareable from this tab.
		window.history.replaceState(
			null,
			"",
			window.location.pathname + window.location.search
		);

		if (!raw) {
			setError(t("authAgent.errorMissing"));
			return (): void => {
				active = false;
			};
		}

		void (async (): Promise<void> => {
			try {
				const grant = await resolveAgentViewGrant(raw, createClient().onboard);
				if (!active) {
					return;
				}
				setLinkSession(grant, grant.wallet);
				router.replace("/explore");
			} catch {
				if (active) {
					setError(t("authAgent.errorInvalid"));
				}
			}
		})();

		return (): void => {
			active = false;
		};
	}, [router, setLinkSession, t]);

	return (
		<div className="mx-auto flex min-h-[40vh] max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
			{error ? (
				<>
					<h1 className="text-lg font-semibold text-danger">
						{t("authAgent.errorTitle")}
					</h1>
					<p className="text-sm text-muted">{error}</p>
					<button
						className="mt-2 rounded-md bg-primary px-4 py-2 text-sm text-white hover:bg-primary-hover"
						type="button"
						onClick={(): void => router.replace("/")}
					>
						{t("authAgent.goHome")}
					</button>
				</>
			) : (
				<>
					<h1 className="text-lg font-semibold text-front">
						{t("authAgent.checking")}
					</h1>
					<p className="text-sm text-muted">
						{t("authAgent.checkingSubtitle")}
					</p>
				</>
			)}
		</div>
	);
}
