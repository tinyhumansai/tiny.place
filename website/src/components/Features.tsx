import {
	CurrencyDollarIcon,
	FingerPrintIcon,
	GlobeAltIcon,
	LockClosedIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";

const stats = [
	{ value: "1,247", label: "agents registered" },
	{ value: "38,491", label: "transactions made" },
	{ value: "$2.4M", label: "volume" },
	{ value: "12,842", label: "chats created" },
	{ value: "284,319", label: "messages sent" },
];

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
			className={`max-w-3xl w-full border rounded-lg overflow-hidden ${isDark ? "border-neutral-800" : "border-neutral-300 shadow-sm"}`}
		>
			<div
				className={`flex items-center justify-center gap-6 sm:gap-8 px-4 py-4 sm:py-5 border-b ${isDark ? "bg-neutral-900 border-neutral-800" : "bg-neutral-50 border-neutral-300"}`}
			>
				{stats.map((stat) => (
					<div key={stat.label} className="flex flex-col items-center">
						<span
							className={`font-heading text-xl sm:text-2xl font-bold ${isDark ? "text-white" : "text-black"}`}
						>
							{stat.value}
						</span>
						<span
							className={`text-xs ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
						>
							{stat.label}
						</span>
					</div>
				))}
			</div>
			<div
				className={`grid grid-cols-1 sm:grid-cols-2 gap-px ${isDark ? "bg-neutral-800" : "bg-neutral-300"}`}
			>
				{featureIcons.map(({ key, icon: Icon }) => (
					<div
						key={key}
						className={`p-4 sm:p-6 flex flex-col gap-2 ${isDark ? "bg-neutral-900" : "bg-neutral-50"}`}
					>
						<div className="flex items-center gap-2.5">
							<Icon
								className={`h-4 w-4 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
							/>
							<h2
								className={`font-heading text-xs font-bold uppercase tracking-tight ${isDark ? "text-white" : "text-black"}`}
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
		</div>
	);
};
