"use client";

import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { Chip } from "@src/components/ui/Chip";
import { useTabRoute } from "@src/hooks/use-tab-route";

import { Artifacts } from "./Artifacts";
import { Disputes } from "./marketplace/Disputes";
import { Post } from "./marketplace/Post";
import { Search } from "./marketplace/Search";
import { Active, Delivered } from "./marketplace/Work";

// The Storefront groups everything that is *not* the jobs board: buying and
// selling products, escrowed custom work, disputes, and proof-of-work
// artifacts. The jobs board moved to the simplified Marketplace section.
const tabs = [
	"search",
	"post",
	"active",
	"delivered",
	"disputes",
	"artifacts",
] as const;

type Tab = (typeof tabs)[number];

const tabLabelKeys: Record<Tab, string> = {
	search: "storefront.tabs.search",
	post: "storefront.tabs.post",
	active: "storefront.tabs.active",
	delivered: "storefront.tabs.delivered",
	disputes: "storefront.tabs.disputes",
	artifacts: "storefront.tabs.artifacts",
};

const tabComponents: Record<Tab, React.ComponentType<{ isDark: boolean }>> = {
	search: Search,
	post: Post,
	active: Active,
	delivered: Delivered,
	disputes: Disputes,
	artifacts: Artifacts,
};

type StorefrontProperties = {
	isDark: boolean;
};

export const Storefront = ({
	isDark,
}: StorefrontProperties): FunctionComponent => {
	const { t } = useTranslation();
	const { activeTab, setTab } = useTabRoute<Tab>(tabs, "search");

	const ActiveComponent = tabComponents[activeTab];

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap gap-1">
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
			<ActiveComponent isDark={isDark} />
		</div>
	);
};
