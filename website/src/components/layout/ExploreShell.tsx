"use client";

import {
	ChartBarIcon,
	ChatBubbleLeftRightIcon,
	GlobeAltIcon,
	HomeIcon,
	IdentificationIcon,
	MoonIcon,
	PuzzlePieceIcon,
	ShieldExclamationIcon,
	SparklesIcon,
	StarIcon,
	SunIcon,
	TagIcon,
	TrophyIcon,
} from "@heroicons/react/24/outline";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { ActivityMarquee } from "@src/components/ActivityMarquee";
import { ClientOnly } from "@src/components/ClientOnly";
import { ConnectWalletButton } from "@src/components/ConnectWalletButton";
import { ProfileButton } from "@src/components/ProfileButton";
import { Sidebar } from "@src/components/layout/Sidebar";
import { useAppStore } from "@src/store/app";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

// Channels, Groups, Broadcasts and Inbox are tabs inside Messaging; Rooms and
// Poker are tabs inside Games — not separate sidebar sections.
const sections: Array<{
	href?: string;
	icon: IconComponent;
	key: string;
	label: string;
}> = [
	{ key: "home", label: "Home", icon: HomeIcon, href: "/" },
	{ key: "explore", label: "Explore", icon: GlobeAltIcon },
	{ key: "identities", label: "Identities", icon: IdentificationIcon },
	{ key: "messaging", label: "Messaging", icon: ChatBubbleLeftRightIcon },
	{ key: "events", label: "Events", icon: SparklesIcon },
	{ key: "games", label: "Games", icon: PuzzlePieceIcon },
	{ key: "marketplace", label: "Marketplace", icon: TagIcon },
	{ key: "ledger", label: "Ledger", icon: ChartBarIcon },
	{ key: "reputation", label: "Reputation", icon: StarIcon },
	{ key: "moderation", label: "Moderation", icon: ShieldExclamationIcon },
	{ key: "leaderboards", label: "Leaderboards", icon: TrophyIcon },
	{ key: "stats", label: "Stats", icon: ChartBarIcon },
];

type ExploreShellProperties = {
	children: ReactNode;
};

export const ExploreShell = ({
	children,
}: ExploreShellProperties): FunctionComponent => {
	const theme = useAppStore((state) => state.theme);
	const toggleTheme = useAppStore((state) => state.toggleTheme);
	const isDark = theme === "dark";
	const { i18n } = useTranslation();
	const toggleLanguage = (): void => {
		void i18n.changeLanguage(i18n.resolvedLanguage === "en" ? "es" : "en");
	};
	const pathname = usePathname();
	const activeSection =
		pathname === "/" ? "home" : (pathname.split("/").pop() ?? "directory");

	return (
		<div
			className={`font-body h-screen w-full flex overflow-hidden transition-colors ${isDark ? "bg-black" : "bg-white"}`}
		>
			<Sidebar
				activeSection={activeSection}
				isDark={isDark}
				sections={sections}
			/>
			<main className="relative flex-1 min-h-0 overflow-y-auto">
				{/* Hero backdrop: anchored to the top of the body, fading out down
				    the page. Decorative only. */}
				<div
					aria-hidden
					className={`pointer-events-none absolute inset-x-0 top-0 z-0 h-[70vh] bg-cover bg-top bg-no-repeat opacity-10`}
					style={{
						backgroundImage: "url('/hero.png')",
						maskImage:
							"linear-gradient(to bottom, black 0%, black 25%, transparent 100%)",
						WebkitMaskImage:
							"linear-gradient(to bottom, black 0%, black 25%, transparent 100%)",
					}}
				/>
				<header
					className={`sticky top-0 z-20 flex items-center gap-4 border-b pl-14 pr-4 md:px-4 py-2 backdrop-blur transition-colors ${
						isDark
							? "border-neutral-800 bg-black/80"
							: "border-neutral-200 bg-white/80"
					}`}
				>
					<div className="min-w-0 flex-1">
						{/* Client-only: the activity websocket must not run during SSR. */}
						<ClientOnly>
							<ActivityMarquee isDark={isDark} />
						</ClientOnly>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<ConnectWalletButton />
						<ProfileButton />
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
							className={`px-2.5 py-1.5 rounded-full border text-xs transition-colors ${isDark ? "border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500" : "border-neutral-300 text-neutral-500 hover:text-black hover:border-neutral-400"}`}
							type="button"
							onClick={toggleLanguage}
						>
							{i18n.resolvedLanguage === "en" ? "ES" : "EN"}
						</button>
					</div>
				</header>
				<div className="relative z-10 flex-1 pt-[10vh] max-w-4xl mx-auto px-8 py-12">
					{children}
				</div>
			</main>
		</div>
	);
};
