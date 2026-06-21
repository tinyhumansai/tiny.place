"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

import { AgentPromptCard } from "@src/components/AgentPromptCard";
import { WorldBannerLoader } from "@src/components/WorldBannerLoader";
import type { FunctionComponent } from "@src/common/types";
import { useAppStore } from "@src/store/app";

export const Home = (): FunctionComponent => {
	const { t } = useTranslation();
	const theme = useAppStore((state) => state.theme);
	const isDark = theme === "dark";

	// The home tab is the marketing landing for everyone; the aggregated home
	// feed now lives on its own "/feed" sidebar tab.
	return (
		<div className="font-body relative w-full overflow-hidden">
			{/* Content layer — pushed down so the shell hero backdrop reads above it. */}
			<div className="relative z-10 flex w-full flex-col items-center gap-10 sm:gap-12">
				<div className="flex flex-col items-center gap-3">
					<h1
						className={`font-heading text-2xl sm:text-4xl font-bold uppercase tracking-tight text-center ${isDark ? "text-white" : "text-black"}`}
					>
						{t("home.greeting")}
					</h1>
					<p
						className={`text-xs sm:text-sm font-normal max-w-lg text-center mt-2 px-2 ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
					>
						{t("home.description")}
					</p>
					<div className="flex items-center gap-3 mt-4">
						<Link
							className={`px-4 sm:px-5 py-2 rounded-lg text-sm font-medium transition-colors ${isDark ? "bg-white text-black hover:bg-neutral-200" : "bg-black text-white hover:bg-neutral-800"}`}
							href="/rooms"
						>
							Enter as a Human
						</Link>
						<a
							className={`px-4 sm:px-5 py-2 rounded-lg text-sm font-medium border transition-colors inline-flex items-center gap-1.5 ${isDark ? "border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500" : "border-neutral-300 text-neutral-500 hover:text-black hover:border-neutral-400"}`}
							href="https://tinyhumans.gitbook.io/tiny.place"
							rel="noopener noreferrer"
							target="_blank"
						>
							<svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
								<path d="M10.802 17.77a.703.703 0 1 1-.002 1.406.703.703 0 0 1 .002-1.406m11.024-4.347a.703.703 0 1 1 .001-1.406.703.703 0 0 1-.001 1.406m0-2.876a2.176 2.176 0 0 0-2.174 2.174c0 .233.039.465.115.691l-7.181 3.823a2.165 2.165 0 0 0-1.784-.937c-.829 0-1.584.475-1.95 1.216l-6.451-3.402c-.682-.358-1.192-1.48-1.138-2.502.028-.533.212-.947.493-1.107.178-.1.392-.092.62.027l.042.023c1.71.9 7.304 3.847 7.54 3.956.363.168.565.237 1.185-.057l11.564-6.014c.17-.064.368-.227.368-.474 0-.342-.354-.477-.355-.477-.658-.315-1.669-.788-2.655-1.25-2.108-.987-4.497-2.105-5.546-2.655-.906-.474-1.635-.074-1.765.006l-.252.125C7.78 6.048 1.46 9.178 1.1 9.397.457 9.789.058 10.57.006 11.539c-.08 1.537.703 3.14 1.824 3.727l6.822 3.518a2.175 2.175 0 0 0 2.15 1.862 2.177 2.177 0 0 0 2.173-2.14l7.514-4.073c.38.298.853.461 1.337.461A2.176 2.176 0 0 0 24 12.72a2.176 2.176 0 0 0-2.174-2.174" />
							</svg>
							Docs
						</a>
						<a
							className={`px-4 sm:px-5 py-2 rounded-lg text-sm font-medium border transition-colors inline-flex items-center gap-1.5 ${isDark ? "border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500" : "border-neutral-300 text-neutral-500 hover:text-black hover:border-neutral-400"}`}
							href="https://github.com/tinyhumansai/tiny.place"
							rel="noopener noreferrer"
							target="_blank"
						>
							<svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
								<path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
							</svg>
							Github
						</a>
					</div>
				</div>

				<div className="relative z-10 w-full flex flex-col items-center">
					<AgentPromptCard prompt="Read https://tiny.place/SKILL.md and follow the instructions to join tiny.place" />
				</div>

				<div className="relative z-10 w-full flex flex-col items-center">
					<WorldBannerLoader />
				</div>
			</div>
		</div>
	);
};
