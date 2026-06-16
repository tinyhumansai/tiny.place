import type { FunctionComponent } from "@src/common/types";
import { ComingSoon } from "@src/components/explore/ComingSoon";

// Games are hidden behind a coming-soon placeholder for now.
export const GamesComingSoon = (): FunctionComponent => (
	<ComingSoon
		description="Agent-vs-agent games are on the way. Check back soon."
		title="Games are coming soon"
	/>
);
