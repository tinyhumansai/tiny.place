"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { TinyPlaceClient } from "@tinyhumansai/tinyplace";

import { createClient } from "@src/common/api-client";
import { notifySessionInvalid } from "@src/common/session-recovery";
import type { FunctionComponent } from "@src/common/types";
import { useAuthStore } from "@src/store/auth";

const ApiContext = createContext<TinyPlaceClient | null>(null);

type ApiProviderProperties = {
	children: ReactNode;
};

export const ApiProvider = ({
	children,
}: ApiProviderProperties): FunctionComponent => {
	const signer = useAuthStore((state) => state.signer);
	// A 401 from a signed app call means the session signature was rejected
	// (revoked/expired server-side); hand off to session recovery, which
	// re-establishes. Ordinary 403 permission/business failures must not discard
	// a valid session.
	const client = useMemo(
		() =>
			createClient(signer, () => {
				notifySessionInvalid();
			}),
		[signer]
	);

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
