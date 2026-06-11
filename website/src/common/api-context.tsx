"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { TinyVerseClient } from "@tinyhumansai/tinyplace";

import { createClient } from "@src/common/api-client";
import type { FunctionComponent } from "@src/common/types";
import { useAuthStore } from "@src/store/auth";

const ApiContext = createContext<TinyVerseClient | null>(null);

type ApiProviderProperties = {
	children: ReactNode;
};

export const ApiProvider = ({
	children,
}: ApiProviderProperties): FunctionComponent => {
	const signer = useAuthStore((state) => state.signer);
	const client = useMemo(() => createClient(signer), [signer]);

	return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export function useApiClient(): TinyVerseClient {
	const client = useContext(ApiContext);
	if (!client) {
		throw new Error("useApiClient must be used within an ApiProvider");
	}
	return client;
}
