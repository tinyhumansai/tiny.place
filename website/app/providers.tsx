"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { Suspense, type ReactNode } from "react";

import { ApiProvider } from "@src/common/api-context";
import { ConnectionFooter } from "@src/components/ConnectionFooter";
import { E2EAuthBridge } from "@src/components/E2EAuthBridge";
import { ExploreShell } from "@src/components/layout/ExploreShell";
import { ThemeController } from "@src/components/ThemeController";
import { WebOnboardingGate } from "@src/components/onboard/WebOnboardingGate";
import { MOONPAY_API_KEY } from "@src/common/moonpay";
import { queryClient } from "@src/common/query-client";
import { useHydrated } from "@src/common/use-hydrated";
import { WalletContextProvider } from "@src/common/wallet-context";
import "@src/common/i18n";
import "@src/common/sentry";

type ProvidersProperties = {
	children: ReactNode;
};

// MoonPay's React SDK is browser-only (it touches `window` when rendered), so it
// is loaded via a no-SSR dynamic import: the module is never evaluated on the
// server, keeping every route server-renderable.
const MoonPayProvider = dynamic(
	() => import("@moonpay/moonpay-react").then((m) => m.MoonPayProvider),
	{ ssr: false }
);

/**
 * Mounts the MoonPay provider on the client only. It is consumed solely by the
 * on-ramp tab, so `children` render unwrapped during SSR and the first paint,
 * then the provider mounts after hydration — keeping MoonPay out of the
 * server-rendered, SEO-critical path.
 */
function ClientMoonPayProvider({
	children,
}: ProvidersProperties): React.ReactElement {
	const mounted = useHydrated();

	if (!mounted) {
		return <>{children}</>;
	}
	return <MoonPayProvider apiKey={MOONPAY_API_KEY}>{children}</MoonPayProvider>;
}

/**
 * Composes the app's global providers (TanStack Query, wallet, API) and shared
 * client-side chrome (theme, onboarding gate, shell, connection footer). Server-
 * renders so page content reaches the initial HTML; browser-only pieces (the
 * Phantom wallet SDK, MoonPay) defer to the client via their own mount gates.
 */
export function Providers({
	children,
}: ProvidersProperties): React.ReactElement {
	return (
		<QueryClientProvider client={queryClient}>
			<WalletContextProvider>
				<ApiProvider>
					<ThemeController />
					{/* Reads useSearchParams; a Suspense boundary keeps static
					    prerendering from bailing the whole route to CSR. */}
					<Suspense fallback={null}>
						<WebOnboardingGate />
					</Suspense>
					<ClientMoonPayProvider>
						<ExploreShell>{children}</ExploreShell>
					</ClientMoonPayProvider>
					<ConnectionFooter />
					<E2EAuthBridge />
				</ApiProvider>
			</WalletContextProvider>
		</QueryClientProvider>
	);
}
