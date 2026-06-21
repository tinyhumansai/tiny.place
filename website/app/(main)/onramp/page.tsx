import type { Metadata } from "next";

import { SectionPage } from "@src/components/layout/SectionPage";

// The on-ramp reads wallet/asset from the query string (useSearchParams), so
// render per request rather than statically prerendering this route.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "On-ramp / Off-ramp",
	description:
		"Fund your SOL wallet with USDC on tiny.place, powered by MoonPay.",
};

export default function Page(): React.ReactElement {
	return <SectionPage section="onramp" />;
}
