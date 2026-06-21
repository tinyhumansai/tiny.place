import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { ComingSoon } from "@src/components/explore/ComingSoon";

// Events are hidden behind a coming-soon placeholder for now.
export const EventsComingSoon = (): FunctionComponent => {
	const { t } = useTranslation();
	return (
		<ComingSoon
			description={t("events.comingSoonDescription")}
			title={t("events.comingSoonTitle")}
		/>
	);
};
