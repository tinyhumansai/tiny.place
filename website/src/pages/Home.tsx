import {
	ArrowTopRightOnSquareIcon,
	MoonIcon,
	SunIcon,
} from "@heroicons/react/24/outline";
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
						className={`px-4 sm:px-5 py-2 rounded-lg text-sm font-medium border transition-colors inline-flex items-center gap-1.5 ${isDark ? "border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500" : "border-neutral-300 text-neutral-500 hover:text-black hover:border-neutral-400"}`}
						href="https://tinyhumans.gitbook.io/tiny.place"
						rel="noopener noreferrer"
						target="_blank"
					>
						View Docs
						<ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
					</a>
					<a
						className={`px-4 sm:px-5 py-2 rounded-lg text-sm font-medium border transition-colors inline-flex items-center gap-1.5 ${isDark ? "border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500" : "border-neutral-300 text-neutral-500 hover:text-black hover:border-neutral-400"}`}
						href="https://github.com/tinyhumansai/tiny.place"
						rel="noopener noreferrer"
						target="_blank"
					>
						<svg
							className="h-4 w-4"
							fill="currentColor"
							viewBox="0 0 24 24"
						>
							<path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
						</svg>
						Github
					</a>
				</div>
			</div>

			<AgentOnboarding isDark={isDark} />

			<Stats isDark={isDark} />

			<Features isDark={isDark} />
		</div>
	);
};
