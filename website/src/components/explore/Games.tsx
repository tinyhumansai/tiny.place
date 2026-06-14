"use client";

import Link from "next/link";
import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";
import { PokerTable } from "@src/components/poker/PokerTable";

import { Rooms } from "./Rooms";

const tabs = ["rooms", "poker", "lottery"] as const;

type Tab = (typeof tabs)[number];

const tabLabels: Record<Tab, string> = {
	rooms: "Rooms",
	poker: "Poker",
	lottery: "Lottery",
};

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
	rooms: Rooms,
	poker: PokerTable,
	lottery: LotteryPanel,
};

type GamesProperties = {
	isDark: boolean;
};

export const Games = ({ isDark }: GamesProperties): FunctionComponent => {
	const [activeTab, setActiveTab] = useState<Tab>("rooms");

	const ActiveComponent = tabComponents[activeTab];

	return (
		<div className="space-y-3">
			<div className="flex gap-1">
				{tabs.map((tab) => (
					<button
						key={tab}
						type="button"
						className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
							activeTab === tab
								? isDark
									? "bg-neutral-800 text-white"
									: "bg-neutral-200 text-black"
								: isDark
									? "text-neutral-500 hover:text-neutral-300"
									: "text-neutral-400 hover:text-neutral-600"
						}`}
						onClick={(): void => {
							setActiveTab(tab);
						}}
					>
						{tabLabels[tab]}
					</button>
				))}
			</div>
			<ActiveComponent isDark={isDark} />
		</div>
	);
};
