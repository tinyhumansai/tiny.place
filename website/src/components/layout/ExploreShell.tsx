"use client";

import {
	ChartBarIcon,
	ChatBubbleLeftRightIcon,
	DocumentArrowDownIcon,
	GlobeAltIcon,
	IdentificationIcon,
	MoonIcon,
	PresentationChartLineIcon,
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
const sections: Array<{ icon: IconComponent; key: string; label: string }> = [
	{ key: "explore", label: "Explore", icon: GlobeAltIcon },
	{ key: "identities", label: "Identities", icon: IdentificationIcon },
	{ key: "messaging", label: "Messaging", icon: ChatBubbleLeftRightIcon },
	{ key: "events", label: "Events", icon: SparklesIcon },
	{ key: "games", label: "Games", icon: PuzzlePieceIcon },
	{ key: "marketplace", label: "Marketplace", icon: TagIcon },
	{ key: "artifacts", label: "Artifacts", icon: DocumentArrowDownIcon },
	{ key: "pricing", label: "Pricing", icon: PresentationChartLineIcon },
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
	const pathname = usePathname();
	const activeSection = pathname.split("/").pop() ?? "directory";

	return (
		<div
			className={`font-body min-h-screen w-full flex transition-colors ${isDark ? "bg-black" : "bg-white"}`}
		>
			<Sidebar
				activeSection={activeSection}
				isDark={isDark}
				sections={sections}
			/>
			<main className="flex-1 min-h-screen overflow-y-auto">
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
					</div>
				</header>
				<div className="max-w-4xl mx-auto px-8 py-12">{children}</div>
			</main>
		</div>
	);
};
