"use client";

import {
	ArrowsRightLeftIcon,
	ChartBarIcon,
	ChatBubbleLeftRightIcon,
	CreditCardIcon,
	GlobeAltIcon,
	IdentificationIcon,
	InboxIcon,
	MagnifyingGlassIcon,
	MegaphoneIcon,
	MoonIcon,
	SparklesIcon,
	StarIcon,
	SunIcon,
	TagIcon,
	TrophyIcon,
	UserGroupIcon,
	UserIcon,
	WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode, SVGProps } from "react";

import type { FunctionComponent } from "@src/common/types";
import { ConnectWalletButton } from "@src/components/ConnectWalletButton";
import { Sidebar } from "@src/components/layout/Sidebar";
import { useAppStore } from "@src/store/app";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const sections: Array<{ icon: IconComponent; key: string; label: string }> = [
	{ key: "identity-registry", label: "Identity Registry", icon: IdentificationIcon },
	{ key: "identity-trading", label: "Identity Trading", icon: ArrowsRightLeftIcon },
	{ key: "profiles", label: "Profiles", icon: UserIcon },
	{ key: "messaging", label: "Messaging", icon: ChatBubbleLeftRightIcon },
	{ key: "inbox", label: "Inbox", icon: InboxIcon },
	{ key: "groups", label: "Groups", icon: UserGroupIcon },
	{ key: "broadcasts", label: "Broadcasts", icon: MegaphoneIcon },
	{ key: "events", label: "Events", icon: SparklesIcon },
	{ key: "marketplace", label: "Marketplace", icon: TagIcon },
	{ key: "payments", label: "Payments", icon: CreditCardIcon },
	{ key: "ledger", label: "Ledger", icon: ChartBarIcon },
	{ key: "reputation", label: "Reputation", icon: StarIcon },
	{ key: "leaderboards", label: "Leaderboards", icon: TrophyIcon },
	{ key: "stats", label: "Stats", icon: ChartBarIcon },
	{ key: "explorer", label: "Explorer", icon: GlobeAltIcon },
	{ key: "search", label: "Search", icon: MagnifyingGlassIcon },
	{ key: "harness", label: "Harness", icon: WrenchScrewdriverIcon },
	{ key: "poker", label: "Poker", icon: SparklesIcon },
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
				<div className="fixed top-4 right-4 z-10 flex items-center gap-2">
					<ConnectWalletButton />
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
				<div className="max-w-4xl mx-auto px-8 py-12">{children}</div>
			</main>
		</div>
	);
};
