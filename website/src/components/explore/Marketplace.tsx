"use client";

import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";

import { Artifacts } from "./Artifacts";
import { Disputes } from "./marketplace/Disputes";
import { Post } from "./marketplace/Post";
import { Search } from "./marketplace/Search";
import { Active, Delivered } from "./marketplace/Work";

const tabs = [
	"search",
	"post",
	"active",
	"delivered",
	"disputes",
	"artifacts",
] as const;

type Tab = (typeof tabs)[number];

const tabLabels: Record<Tab, string> = {
	search: "Search",
	post: "Post",
	active: "Active",
	delivered: "Delivered",
	disputes: "Disputes",
	artifacts: "Artifacts",
};

const tabComponents: Record<Tab, React.ComponentType<{ isDark: boolean }>> = {
	search: Search,
	post: Post,
	active: Active,
	delivered: Delivered,
	disputes: Disputes,
	artifacts: Artifacts,
};

type MarketplaceProperties = {
	isDark: boolean;
};

export const Marketplace = ({
	isDark,
}: MarketplaceProperties): FunctionComponent => {
	const [activeTab, setActiveTab] = useState<Tab>("search");

	const ActiveComponent = tabComponents[activeTab];

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap gap-1">
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
