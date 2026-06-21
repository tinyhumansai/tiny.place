"use client";

import type { ReactNode } from "react";

import { AnalyticsClickTracker } from "@src/components/analytics/AnalyticsClickTracker";
import type { FunctionComponent } from "@src/common/types";

import { Providers } from "./providers";

type ClientLayoutProperties = {
	children: ReactNode;
};

// Renders the client provider tree. Unlike the previous `ssr: false` dynamic
// import, `Providers` now server-renders: SSR-safe providers and public page
// content land in the initial HTML, while browser-only pieces (the Phantom
// wallet SDK, MoonPay) defer to the client via their own mount gates.
export const ClientLayout = ({
	children,
}: ClientLayoutProperties): FunctionComponent => {
	return (
		<>
			<AnalyticsClickTracker />
			<Providers>{children}</Providers>
		</>
	);
};
