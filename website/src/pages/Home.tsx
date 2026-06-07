import {
	CurrencyDollarIcon,
	FingerPrintIcon,
	GlobeAltIcon,
	LockClosedIcon,
	MoonIcon,
	SunIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { useAppStore } from "@src/store/app";

const featureIcons = [
	{ key: "identity" as const, icon: FingerPrintIcon },
	{ key: "directory" as const, icon: GlobeAltIcon },
	{ key: "relay" as const, icon: LockClosedIcon },
	{ key: "payments" as const, icon: CurrencyDollarIcon },
];

export const Home = (): FunctionComponent => {
	const { t, i18n } = useTranslation();
	const theme = useAppStore((state) => state.theme);
	const toggleTheme = useAppStore((state) => state.toggleTheme);
	const isDark = theme === "dark";

	const onTranslateButtonClick = async (): Promise<void> => {
		if (i18n.resolvedLanguage === "en") {
			await i18n.changeLanguage("es");
		} else {
			await i18n.changeLanguage("en");
		}
	};

	return (
		<div
			className={`font-body min-h-screen w-full flex flex-col items-center px-6 py-24 transition-colors ${isDark ? "bg-black" : "bg-white"}`}
		>
			<div className="fixed top-6 right-6 flex items-center gap-2">
				<button
					className={`p-2 rounded-full border transition-colors ${isDark ? "border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500" : "border-neutral-300 text-neutral-500 hover:text-black hover:border-neutral-400"}`}
					type="button"
					onClick={toggleTheme}
				>
					{isDark ? (
						<SunIcon className="h-4 w-4" />
					) : (
						<MoonIcon className="h-4 w-4" />
					)}
				</button>
				<button
					className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${isDark ? "border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500" : "border-neutral-300 text-neutral-500 hover:text-black hover:border-neutral-400"}`}
					type="button"
					onClick={onTranslateButtonClick}
				>
					{i18n.resolvedLanguage === "en" ? "ES" : "EN"}
				</button>
			</div>

			<div className="flex flex-col items-center gap-3 mb-20">
				<h1
					className={`font-heading text-5xl font-black uppercase tracking-widest text-center ${isDark ? "text-white" : "text-black"}`}
				>
					{t("home.greeting")}
				</h1>
				<p
					className={`text-lg font-normal max-w-lg text-center mt-2 ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
				>
					{t("home.description")}
				</p>
			</div>

			<div
				className={`grid grid-cols-1 md:grid-cols-2 gap-px max-w-3xl w-full border rounded-lg overflow-hidden ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
			>
				{featureIcons.map(({ key, icon: Icon }) => (
					<div
						key={key}
						className={`p-6 flex flex-col gap-2 ${isDark ? "bg-neutral-950" : "bg-neutral-50"}`}
					>
						<div className="flex items-center gap-2.5">
							<Icon
								className={`h-4 w-4 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
							/>
							<h2
								className={`font-heading text-xs font-bold uppercase tracking-wider ${isDark ? "text-white" : "text-black"}`}
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
