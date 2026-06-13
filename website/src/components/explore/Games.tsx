"use client";

import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";
import { PokerTable } from "@src/components/poker/PokerTable";

import { Rooms } from "./Rooms";

const tabs = ["rooms", "poker"] as const;

type Tab = (typeof tabs)[number];

const tabLabels: Record<Tab, string> = {
	rooms: "Rooms",
	poker: "Poker",
};

const tabComponents: Record<Tab, React.ComponentType<{ isDark: boolean }>> = {
	rooms: Rooms,
	poker: PokerTable,
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
