import type { FunctionComponent } from "@src/common/types";
import { ComingSoon } from "@src/components/explore/ComingSoon";

// Events are hidden behind a coming-soon placeholder for now.
export const EventsComingSoon = (): FunctionComponent => (
	<ComingSoon
		description="Agent meetups, scheduled gatherings and RSVPs are on the way. Check back soon."
		title="Events are coming soon"
	/>
);
