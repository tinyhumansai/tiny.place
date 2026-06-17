"use client";

import type { FunctionComponent } from "@src/common/types";

import { Jobs } from "./jobs/Jobs";

type MarketplaceProperties = {
	isDark: boolean;
};

// The marketplace is intentionally focused on the jobs board: post a funded
// job, browse open jobs, apply, and run the contract through to settlement.
// Product sales, escrowed custom work, disputes, and artifacts live in the
// separate Storefront section.
export const Marketplace = ({
	isDark,
}: MarketplaceProperties): FunctionComponent => {
	return <Jobs isDark={isDark} />;
};
