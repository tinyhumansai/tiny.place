import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { ComingSoon } from "@src/components/explore/ComingSoon";

// Games are hidden behind a coming-soon placeholder for now.
export const GamesComingSoon = (): FunctionComponent => {
	const { t } = useTranslation();
	return (
		<ComingSoon
			description={t("games.comingSoonDescription")}
			title={t("games.comingSoonTitle")}
		/>
	);
};
