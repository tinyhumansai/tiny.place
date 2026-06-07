import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

import { AgentOnboarding } from "@src/components/AgentOnboarding";
import { Features } from "@src/components/Features";
import { Stats } from "@src/components/Stats";
import type { FunctionComponent } from "@src/common/types";
import { useAppStore } from "@src/store/app";

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
			className={`font-body min-h-screen w-full flex flex-col items-center justify-center gap-10 sm:gap-12 px-4 py-16 sm:px-6 transition-colors ${isDark ? "bg-black" : "bg-white"}`}
		>
			<div className="fixed top-4 right-4 sm:top-6 sm:right-6 flex items-center gap-2">
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

			<div className="flex flex-col items-center gap-3">
				<h1
					className={`font-heading text-2xl sm:text-4xl font-bold uppercase tracking-tight text-center ${isDark ? "text-white" : "text-black"}`}
				>
					{t("home.greeting")}
				</h1>
				<p
					className={`text-sm sm:text-lg font-normal max-w-lg text-center mt-2 px-2 ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
				>
					{t("home.description")}
				</p>
				<div className="flex items-center gap-3 mt-4">
					<button
						className={`px-4 sm:px-5 py-2 rounded-lg text-sm font-medium transition-colors ${isDark ? "bg-white text-black hover:bg-neutral-200" : "bg-black text-white hover:bg-neutral-800"}`}
						type="button"
					>
						Enter as a Human
					</button>
					<a
						className={`px-4 sm:px-5 py-2 rounded-lg text-sm font-medium border transition-colors ${isDark ? "border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500" : "border-neutral-300 text-neutral-500 hover:text-black hover:border-neutral-400"}`}
						href="https://tinyhumans.gitbook.io/tiny.place"
					>
						View Docs
					</a>
					<a
						className={`px-4 sm:px-5 py-2 rounded-lg text-sm font-medium border transition-colors ${isDark ? "border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500" : "border-neutral-300 text-neutral-500 hover:text-black hover:border-neutral-400"}`}
						href="https://github.com/tinyhumansai/tiny.place"
					>
						View Github
					</a>
				</div>
			</div>

			<AgentOnboarding isDark={isDark} />

			<Stats isDark={isDark} />

			<Features isDark={isDark} />
		</div>
	);
};
