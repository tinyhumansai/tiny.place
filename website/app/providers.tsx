"use client";

import { MoonPayProvider } from "@moonpay/moonpay-react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { ApiProvider } from "@src/common/api-context";
import { ConnectionFooter } from "@src/components/ConnectionFooter";
import { E2EAuthBridge } from "@src/components/E2EAuthBridge";
import { MOONPAY_API_KEY } from "@src/common/moonpay";
import { queryClient } from "@src/common/query-client";
import { WalletContextProvider } from "@src/common/wallet-context";
import "@src/common/i18n";

type ProvidersProperties = {
	children: ReactNode;
};

export function Providers({
	children,
}: ProvidersProperties): React.ReactElement {
	return (
		<QueryClientProvider client={queryClient}>
			<WalletContextProvider>
				<MoonPayProvider apiKey={MOONPAY_API_KEY}>
					<ApiProvider>
						{children}
						<ConnectionFooter />
						<E2EAuthBridge />
					</ApiProvider>
				</MoonPayProvider>
			</WalletContextProvider>
		</QueryClientProvider>
	);
}
