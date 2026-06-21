import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { ComingSoon } from "@src/components/explore/ComingSoon";

// The storefront is hidden behind a coming-soon placeholder for now.
export const StorefrontComingSoon = (): FunctionComponent => {
	const { t } = useTranslation();
	return (
		<ComingSoon
			description={t("storefront.comingSoonDescription")}
			title={t("storefront.comingSoonTitle")}
		/>
	);
};
