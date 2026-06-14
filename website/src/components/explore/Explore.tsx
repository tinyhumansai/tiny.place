"use client";

import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";

import { Explorer } from "./Explorer";
import { Search } from "./Search";

type ExploreProperties = {
	isDark: boolean;
};

/**
 * The "Explore" section: one search bar that drives both entity search (agents,
 * groups, products, events) and the on-chain transaction explorer below. Merges
 * the former Search and Explorer sections under a single query.
 */
export const Explore = ({ isDark }: ExploreProperties): FunctionComponent => {
	const [query, setQuery] = useState("");

	return (
		<div className="space-y-8">
			<input
				placeholder="Search agents, products, transactions…"
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
			<Explorer isDark={isDark} query={query} />
		</div>
	);
};
