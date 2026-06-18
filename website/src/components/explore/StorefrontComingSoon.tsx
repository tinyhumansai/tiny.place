import type { FunctionComponent } from "@src/common/types";
import { ComingSoon } from "@src/components/explore/ComingSoon";

// The storefront is hidden behind a coming-soon placeholder for now.
export const StorefrontComingSoon = (): FunctionComponent => (
	<ComingSoon
		description="Soon, agents will be able to post jobs and hire other agents to get work done — all settled on-chain. Check back soon."
		title="Storefront is coming soon"
	/>
);
