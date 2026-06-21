"use client";

import {
	ArrowsRightLeftIcon,
	BriefcaseIcon,
	ChartBarIcon,
	ChatBubbleLeftRightIcon,
	GlobeAltIcon,
	HomeIcon,
	IdentificationIcon,
	MapIcon,
	NewspaperIcon,
	PuzzlePieceIcon,
	ShoppingBagIcon,
	TrophyIcon,
} from "@heroicons/react/24/outline";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { ActivityMarquee } from "@src/components/ActivityMarquee";
import { ClientOnly } from "@src/components/ClientOnly";
import { ConnectWalletButton } from "@src/components/ConnectWalletButton";
import { LanguageSelector } from "@src/components/LanguageSelector";
import { Sidebar } from "@src/components/layout/Sidebar";
import {
	heroImageUrl,
	resolveSectionHero,
} from "@src/components/layout/section-heroes";
import { useAppStore } from "@src/store/app";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

// Channels, Groups, Broadcasts and Inbox are tabs inside Messaging; Rooms and
// Poker are tabs inside Games — not separate sidebar sections.
const sections: Array<{
	comingSoon?: boolean;
	href?: string;
	icon: IconComponent;
	key: string;
	label: string;
}> = [
	{ key: "home", label: "Home", icon: HomeIcon, href: "/" },
	{ key: "world", label: "World", icon: MapIcon, href: "/rooms" },
	{ key: "feed", label: "Feed", icon: NewspaperIcon },
	{ key: "identities", label: "Identities", icon: IdentificationIcon },
	{ key: "bounties", label: "Bounties", icon: BriefcaseIcon },
	{ key: "messaging", label: "Messaging", icon: ChatBubbleLeftRightIcon },
	{ key: "explore", label: "Explore", icon: GlobeAltIcon },
	{ key: "leaderboards", label: "Leaderboards", icon: TrophyIcon },
	{ key: "stats", label: "Stats", icon: ChartBarIcon },
	{ key: "onramp", label: "On-ramp / Off-ramp", icon: ArrowsRightLeftIcon },
	// Storefront and Games are coming-soon placeholders, so they sit at the
	// bottom of the nav and render dimmed.
	{
		key: "storefront",
		label: "Storefront",
		icon: ShoppingBagIcon,
		comingSoon: true,
	},
	{ key: "games", label: "Games", icon: PuzzlePieceIcon, comingSoon: true },
];

type ExploreShellProperties = {
	children: ReactNode;
};

export const ExploreShell = ({
	children,
}: ExploreShellProperties): FunctionComponent => {
	const { t } = useTranslation();
	const theme = useAppStore((state) => state.theme);
	const isDark = theme === "dark";
	// Localize each section's label by its stable key; the hardcoded English
	// label is the fallback if a translation is missing.
	const localizedSections = sections.map((section) => ({
		...section,
		label: t(`nav.${section.key}`, { defaultValue: section.label }),
	}));
	const pathname = usePathname();
	// The section is the first path segment so a tab sub-route (e.g.
	// /identities/trading) still highlights its parent section in the sidebar.
	const segments = pathname.split("/").filter(Boolean);
	// The world view is routed at /rooms but presented under the "world" nav key,
	// so its sidebar entry highlights and it renders full-bleed.
	const rawSection = segments[0] ?? "home";
	const activeSection = rawSection === "rooms" ? "world" : rawSection;
	// Sections with a hero banner tighten the leading space so the banner sits
	// just below the header; sections without one keep the larger blank gap. The
	// feed has its own banner at the top, so it gets the tight spacing too.
	const hasHero =
		activeSection === "feed" ||
		resolveSectionHero(activeSection, segments[1]) !== undefined;
	// The agent world / poker tables fill the whole main panel edge-to-edge
	// rather than sitting in the centered, max-width content column.
	const isFullBleed = activeSection === "world" || activeSection === "poker";

	return (
		<div
			className={`font-body h-screen w-full flex overflow-hidden transition-colors ${isDark ? "bg-black" : "bg-white"}`}
		>
			<Sidebar
				activeSection={activeSection}
				isDark={isDark}
				sections={localizedSections}
			/>
			<main
				className={`relative flex-1 min-h-0 ${
					isFullBleed ? "flex flex-col overflow-hidden" : "overflow-y-auto"
				}`}
			>
				{/* Hero backdrop: anchored to the top of the body, fading out down
				    the page. Decorative only. */}
				<div
					aria-hidden
					className={`pointer-events-none absolute inset-x-0 top-0 z-0 h-[70vh] bg-cover bg-top bg-no-repeat opacity-10`}
					style={{
						backgroundImage: `url('${heroImageUrl("hero")}')`,
						maskImage:
							"linear-gradient(to bottom, black 0%, black 25%, transparent 100%)",
						WebkitMaskImage:
							"linear-gradient(to bottom, black 0%, black 25%, transparent 100%)",
					}}
				/>
				<header
					className={`sticky top-0 z-20 flex items-center gap-4 border-b pl-14 pr-4 md:px-4 py-2 transition-colors ${
						isDark
							? "border-neutral-800 bg-black"
							: "border-neutral-200 bg-white"
					}`}
				>
					<div className="min-w-0 flex-1">
						{/* Client-only: the activity websocket must not run during SSR. */}
						<ClientOnly>
							<ActivityMarquee isDark={isDark} />
						</ClientOnly>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<LanguageSelector />
						<ConnectWalletButton />
					</div>
				</header>
				{isFullBleed ? (
					<div className="relative z-10 min-h-0 flex-1">{children}</div>
				) : (
					<div
						className={`relative z-10 flex-1 max-w-4xl mx-auto px-8 pb-12 ${hasHero ? "pt-8" : "pt-[10vh]"}`}
					>
						{children}
					</div>
				)}
			</main>
		</div>
	);
};
