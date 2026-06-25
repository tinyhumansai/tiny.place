"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { TinyPlaceClient } from "@tinyhumansai/tinyplace";

import { createClient, createOnboardClient } from "@src/common/api-client";
import { notifySessionInvalid } from "@src/common/session-recovery";
import type { FunctionComponent } from "@src/common/types";
import { useAuthStore } from "@src/store/auth";

const ApiContext = createContext<TinyPlaceClient | null>(null);

type ApiProviderProperties = {
	children: ReactNode;
};

function isInvalidSignature(body: unknown): boolean {
	if (typeof body === "string") {
		return body.toLowerCase().includes("invalid signature");
	}
	if (body && typeof body === "object" && "error" in body) {
		return String(body.error).toLowerCase().includes("invalid signature");
	}
	return false;
}

export const ApiProvider = ({
	children,
}: ApiProviderProperties): FunctionComponent => {
	const signer = useAuthStore((state) => state.signer);
	const onboardGrant = useAuthStore((state) => state.onboardGrant);
	// A 401 from a signed app call means the session signature was rejected
	// (revoked/expired server-side); hand off to session recovery, which
	// re-establishes. Ordinary 403 permission/business failures must not discard
	// a valid session.
	const client = useMemo(() => {
		const onAuthInvalid = (_status: number, body: unknown): void => {
			notifySessionInvalid({ forceResign: isInvalidSignature(body) });
		};
		// A read-only view-as-agent link session (#190) replays its bearer grant
		// instead of signing per request. A real signer always supersedes it.
		if (!signer && onboardGrant) {
			return createOnboardClient(onboardGrant, onAuthInvalid);
		}
		return createClient(signer, onAuthInvalid);
	}, [signer, onboardGrant]);

	return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export function useApiClient(): TinyPlaceClient {
	const client = useContext(ApiContext);
	if (!client) {
		throw new Error("useApiClient must be used within an ApiProvider");
	}
	return client;
}
