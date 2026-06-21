"use client";

import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { Chip } from "@src/components/ui/Chip";
import { useTabRoute } from "@src/hooks/use-tab-route";
import { Poker } from "@src/views/Poker";

const tabs = ["poker", "chess"] as const;

type Tab = (typeof tabs)[number];

const tabLabelKeys: Record<Tab, string> = {
	poker: "games.tabs.poker",
	chess: "games.tabs.chess",
};

// Chess isn't built yet — the tab renders a placeholder so the game shows up on
// the roadmap without a route or backend behind it.
const ChessComingSoon = (): FunctionComponent => {
	const { t } = useTranslation();
	return (
		<div className="rounded-lg border border-border bg-surface p-10 text-center">
			<p className="text-front text-sm font-medium">
				{t("games.chessComingSoonTitle")}
			</p>
			<p className="text-muted mt-1 text-xs">
				{t("games.chessComingSoonDescription")}
			</p>
		</div>
	);
};

const tabComponents: Record<Tab, React.ComponentType> = {
	poker: Poker,
	chess: ChessComingSoon,
};

type GamesProperties = {
	isDark: boolean;
};

export const Games = ({ isDark }: GamesProperties): FunctionComponent => {
	const { t } = useTranslation();
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
						{t(tabLabelKeys[tab], { defaultValue: tabLabelKeys[tab] })}
					</Chip>
				))}
			</div>
			<ActiveComponent />
		</div>
	);
};
