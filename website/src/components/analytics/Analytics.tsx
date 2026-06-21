import { OpenPanelComponent } from "@openpanel/nextjs";
import { GoogleAnalytics } from "@next/third-parties/google";

import {
	GA_MEASUREMENT_ID,
	OPENPANEL_API_URL,
	OPENPANEL_CLIENT_ID,
} from "@src/common/analytics";
import type { FunctionComponent } from "@src/common/types";

/**
 * Mounts every analytics provider in one place. Both vendors load their own
 * script and self-track route changes (GA via `<GoogleAnalytics>`, OpenPanel via
 * `trackScreenViews`), so page views are covered without bespoke wiring; custom
 * events are sent through `trackEvent` in `@src/common/analytics`.
 */
export const Analytics = (): FunctionComponent => {
	return (
		<>
			<GoogleAnalytics gaId={GA_MEASUREMENT_ID} />
			<OpenPanelComponent
				trackAttributes
				trackOutgoingLinks
				trackScreenViews
				apiUrl={OPENPANEL_API_URL}
				clientId={OPENPANEL_CLIENT_ID}
			/>
		</>
	);
};
