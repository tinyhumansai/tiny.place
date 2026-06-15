"use client";

import Link from "next/link";

import type { FunctionComponent } from "@src/common/types";
import { Chip } from "@src/components/ui/Chip";
import { useTabRoute } from "@src/hooks/use-tab-route";

const tabs = ["poker", "lottery"] as const;

type Tab = (typeof tabs)[number];

const tabLabels: Record<Tab, string> = {
	poker: "Poker",
	lottery: "Lottery",
};

const PokerPanel = ({ isDark }: { isDark: boolean }): FunctionComponent => (
	<div
		className={`rounded-xl border px-5 py-6 text-sm ${
			isDark
				? "border-neutral-800 bg-neutral-900 text-neutral-300"
				: "border-neutral-200 bg-white text-neutral-600"
		}`}
	>
		<p className="mb-3">
			Create poker rooms, rank live rooms by stake, and join simple room views.
		</p>
		<Link
			href="/poker"
			className={`inline-block rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
				isDark
					? "bg-emerald-600 text-white hover:bg-emerald-500"
					: "bg-emerald-500 text-white hover:bg-emerald-400"
			}`}
		>
			Open Poker
		</Link>
	</div>
);

const LotteryPanel = ({ isDark }: { isDark: boolean }): FunctionComponent => (
	<div
		className={`rounded-xl border px-5 py-6 text-sm ${
			isDark
				? "border-neutral-800 bg-neutral-900 text-neutral-300"
				: "border-neutral-200 bg-white text-neutral-600"
		}`}
	>
		<p className="mb-3">
			A rolling 24-hour pooled USDC pot drawn into an exponential multi-winner
			payout.
		</p>
		<Link
			href="/lottery"
			className={`inline-block rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
				isDark
					? "bg-emerald-600 text-white hover:bg-emerald-500"
					: "bg-emerald-500 text-white hover:bg-emerald-400"
			}`}
		>
			Open Lottery
		</Link>
	</div>
);

const tabComponents: Record<Tab, React.ComponentType<{ isDark: boolean }>> = {
	poker: PokerPanel,
	lottery: LotteryPanel,
};

type GamesProperties = {
	isDark: boolean;
};

export const Games = ({ isDark }: GamesProperties): FunctionComponent => {
	const { activeTab, setTab } = useTabRoute<Tab>(tabs, "poker");

	const ActiveComponent = tabComponents[activeTab];

	return (
		<div className="space-y-3">
			<div className="flex gap-1">
				{tabs.map((tab) => (
					<Chip
						key={tab}
						active={activeTab === tab}
						isDark={isDark}
						onClick={(): void => {
							setTab(tab);
						}}
					>
						{tabLabels[tab]}
					</Chip>
				))}
			</div>
			<ActiveComponent isDark={isDark} />
		</div>
	);
};
