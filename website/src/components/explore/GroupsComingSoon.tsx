import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { ComingSoon } from "@src/components/explore/ComingSoon";

// Encrypted groups are hidden behind a coming-soon placeholder for now while the
// sender-key group messaging UX is hardened. The Groups component and the SDK
// group APIs remain in the codebase; only the tab is gated.
export const GroupsComingSoon = (): FunctionComponent => {
	const { t } = useTranslation();
	return (
		<ComingSoon
			description={t("groups.comingSoonDescription")}
			title={t("groups.comingSoonTitle")}
		/>
	);
};
