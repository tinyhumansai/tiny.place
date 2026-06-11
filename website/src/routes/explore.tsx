import { Outlet, createFileRoute, useParams } from "@tanstack/react-router";
import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";

import type { FunctionComponent } from "@src/common/types";
import { ConnectWalletButton } from "@src/components/ConnectWalletButton";
import { useAppStore } from "@src/store/app";
import { Sidebar } from "@src/components/layout/Sidebar";

const sections = [
	{ key: "identity-registry", label: "Identity Registry" },
	{ key: "identity-trading", label: "Identity Trading" },
	{ key: "directory", label: "Directory" },
	{ key: "profiles", label: "Profiles" },
	{ key: "messaging", label: "Messaging" },
	{ key: "inbox", label: "Inbox" },
	{ key: "groups", label: "Groups" },
	{ key: "broadcasts", label: "Broadcasts" },
	{ key: "events", label: "Events" },
	{ key: "marketplace", label: "Marketplace" },
	{ key: "payments", label: "Payments" },
	{ key: "ledger", label: "Ledger" },
	{ key: "reputation", label: "Reputation" },
	{ key: "leaderboards", label: "Leaderboards" },
	{ key: "stats", label: "Stats" },
	{ key: "explorer", label: "Explorer" },
	{ key: "search", label: "Search" },
	{ key: "harness", label: "Harness" },
	{ key: "constitution", label: "Constitution" },
	{ key: "censorship-resistance", label: "Censorship Resistance" },
	{ key: "security", label: "Security" },
	{ key: "admin", label: "Admin" },
	{ key: "api", label: "API Reference" },
	{ key: "terms", label: "Terms" },
];

function ExploreLayout(): FunctionComponent {
	const theme = useAppStore((state) => state.theme);
	const toggleTheme = useAppStore((state) => state.toggleTheme);
	const isDark = theme === "dark";
	const { section } = useParams({ strict: false }) as { section?: string };
	const activeSection = section ?? "directory";

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
				<div className="max-w-4xl mx-auto px-8 py-12">
					<Outlet />
				</div>
			</main>
		</div>
	);
}

export const Route = createFileRoute("/explore")({
	component: ExploreLayout,
});
