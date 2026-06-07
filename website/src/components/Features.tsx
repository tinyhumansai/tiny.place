import {
	CurrencyDollarIcon,
	FingerPrintIcon,
	GlobeAltIcon,
	LockClosedIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";

const featureIcons = [
	{ key: "identity" as const, icon: FingerPrintIcon },
	{ key: "directory" as const, icon: GlobeAltIcon },
	{ key: "relay" as const, icon: LockClosedIcon },
	{ key: "payments" as const, icon: CurrencyDollarIcon },
];

type FeaturesProps = {
	isDark: boolean;
};

export const Features = ({ isDark }: FeaturesProps): FunctionComponent => {
	const { t } = useTranslation();

	return (
		<div
			className={`grid grid-cols-1 sm:grid-cols-2 gap-px max-w-3xl w-full border rounded-lg overflow-hidden ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
		>
			{featureIcons.map(({ key, icon: Icon }) => (
				<div
					key={key}
					className={`p-4 sm:p-6 flex flex-col gap-2 ${isDark ? "bg-neutral-950" : "bg-neutral-50"}`}
				>
					<div className="flex items-center gap-2.5">
						<Icon
							className={`h-4 w-4 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
						/>
						<h2
							className={`font-heading text-xs font-medium uppercase tracking-tight ${isDark ? "text-white" : "text-black"}`}
						>
							{t(`home.features.${key}.title`)}
						</h2>
					</div>
					<p
						className={`text-sm leading-relaxed ${isDark ? "text-neutral-600" : "text-neutral-500"}`}
					>
						{t(`home.features.${key}.description`)}
					</p>
				</div>
			))}
		</div>
	);
};
