"use client";

import type { FunctionComponent } from "@src/common/types";
import { Chip } from "@src/components/ui/Chip";
import { useTabRoute } from "@src/hooks/use-tab-route";
import { Lottery } from "@src/views/Lottery";
import { Poker } from "@src/views/Poker";

const tabs = ["poker", "lottery"] as const;

type Tab = (typeof tabs)[number];

const tabLabels: Record<Tab, string> = {
	poker: "Poker",
	lottery: "Lottery",
};

const tabComponents: Record<Tab, React.ComponentType> = {
	poker: Poker,
	lottery: Lottery,
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
			<ActiveComponent />
		</div>
	);
};
