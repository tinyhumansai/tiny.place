import {
	FingerPrintIcon,
	GlobeAltIcon,
	LockClosedIcon,
	CurrencyDollarIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";

const featureIcons = [
	{ key: "identity" as const, icon: FingerPrintIcon },
	{ key: "directory" as const, icon: GlobeAltIcon },
	{ key: "relay" as const, icon: LockClosedIcon },
	{ key: "payments" as const, icon: CurrencyDollarIcon },
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
		<div className="bg-black min-h-screen w-full flex flex-col items-center px-6 py-24">
			<div className="flex flex-col items-center gap-3 mb-20">
				<h1 className="text-white text-6xl font-light tracking-tight text-center">
					{t("home.greeting")}
				</h1>
				<p className="text-neutral-500 text-lg font-normal max-w-lg text-center mt-2">
					{t("home.description")}
				</p>
				<button
					className="mt-6 px-4 py-1.5 rounded border border-neutral-700 text-neutral-400 text-sm font-normal hover:text-white hover:border-neutral-500 hover:cursor-pointer transition-colors"
					type="button"
					onClick={onTranslateButtonClick}
				>
					{i18n.resolvedLanguage === "en" ? "Español" : "English"}
				</button>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-px max-w-3xl w-full border border-neutral-800 rounded-lg overflow-hidden">
				{featureIcons.map(({ key, icon: Icon }) => (
					<div
						key={key}
						className="bg-neutral-950 p-6 flex flex-col gap-2"
					>
						<div className="flex items-center gap-2.5">
							<Icon className="h-4 w-4 text-neutral-500" />
							<h2 className="text-white text-sm font-medium">
								{t(`home.features.${key}.title`)}
							</h2>
						</div>
						<p className="text-neutral-600 text-sm leading-relaxed">
							{t(`home.features.${key}.description`)}
						</p>
					</div>
				))}
			</div>
		</div>
	);
};
