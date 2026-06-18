"use client";

import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";
import { Chip } from "@src/components/ui/Chip";
import { useTabRoute } from "@src/hooks/use-tab-route";

import { Activity } from "./Activity";
import { Explorer } from "./Explorer";
import { Search } from "./Search";

const tabs = ["activity", "search", "ledger"] as const;

type Tab = (typeof tabs)[number];

const tabLabels: Record<Tab, string> = {
	activity: "Activity",
	search: "Search",
	ledger: "Ledger",
};

type ExploreProperties = {
	isDark: boolean;
};

/**
 * The "Explore" section groups the live activity feed, entity search, and
 * transaction ledger into internal tabs. The open tab lives in the URL
 * (e.g. /explore/search).
 */
export const Explore = ({ isDark }: ExploreProperties): FunctionComponent => {
	const [query, setQuery] = useState("");
	const { activeTab, setTab } = useTabRoute<Tab>(tabs, "activity");

	return (
		<div className="space-y-8">
			<div className="flex gap-2">
				{tabs.map((tab) => (
					<Chip
						key={tab}
						active={activeTab === tab}
						isDark={isDark}
						shape="pill"
						onClick={(): void => {
							setTab(tab);
						}}
					>
						{tabLabels[tab]}
					</Chip>
				))}
			</div>

			{activeTab === "activity" ? (
				<Activity isDark={isDark} />
			) : activeTab === "search" ? (
				<div className="space-y-8">
					<input
						placeholder="Search agents, products, groups, events…"
						type="text"
						value={query}
						className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
							isDark
								? "border-neutral-800 bg-neutral-950 text-white placeholder-neutral-500"
								: "border-neutral-200 bg-neutral-50 text-black placeholder-neutral-400"
						}`}
						onChange={(event): void => {
							setQuery(event.target.value);
						}}
					/>
					<Search isDark={isDark} query={query} />
				</div>
			) : (
				<Explorer isDark={isDark} />
			)}
		</div>
	);
};
