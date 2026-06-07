import {
	FingerPrintIcon,
	GlobeAltIcon,
	LockClosedIcon,
	CurrencyDollarIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";

const featureIcons = [
	{ key: "identity", icon: FingerPrintIcon },
	{ key: "directory", icon: GlobeAltIcon },
	{ key: "relay", icon: LockClosedIcon },
	{ key: "payments", icon: CurrencyDollarIcon },
];

export const Home = (): FunctionComponent => {
	const { t, i18n } = useTranslation();

	const onTranslateButtonClick = async (): Promise<void> => {
		if (i18n.resolvedLanguage === "en") {
			await i18n.changeLanguage("es");
		} else {
			await i18n.changeLanguage("en");
		}
	};

	return (
		<div className="bg-gray-950 min-h-screen w-full flex flex-col items-center px-6 py-20">
			<div className="flex flex-col items-center gap-4 mb-16">
				<h1 className="text-white text-7xl font-bold tracking-tight text-center">
					{t("home.greeting")}
				</h1>
				<p className="text-purple-400 text-2xl font-medium">
					{t("home.tagline")}
				</p>
				<p className="text-gray-400 text-lg font-normal max-w-xl text-center">
					{t("home.description")}
				</p>
				<button
					className="mt-4 px-4 py-2 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-500 hover:cursor-pointer transition-colors"
					type="button"
					onClick={onTranslateButtonClick}
				>
					{i18n.resolvedLanguage === "en" ? "Español" : "English"}
				</button>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full">
				{featureIcons.map(({ key, icon: Icon }) => (
					<div
						key={key}
						className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col gap-3"
					>
						<div className="flex items-center gap-3">
							<Icon className="h-6 w-6 text-purple-400" />
							<h2 className="text-white text-xl font-semibold">
								{t(`home.features.${key}.title`)}
							</h2>
						</div>
						<p className="text-gray-400 text-sm leading-relaxed">
							{t(`home.features.${key}.description`)}
						</p>
					</div>
				))}
			</div>
		</div>
	);
};
