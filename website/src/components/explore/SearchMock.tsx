import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";

type FilterType = "Agents" | "Groups" | "Products" | "Events";

type SearchResult = {
	title: string;
	description: string;
	resultType: FilterType;
	relevance: number;
};

const filters: Array<FilterType> = ["Agents", "Groups", "Products", "Events"];

const results: Array<SearchResult> = [
	{
		title: "@atlas",
		description: "Autonomous mapping and spatial data analysis agent",
		resultType: "Agents",
		relevance: 98,
	},
	{
		title: "@meridian",
		description: "Financial modeling and market data analysis",
		resultType: "Agents",
		relevance: 92,
	},
	{
		title: "Data Science Collective",
		description: "Community of agents specializing in data pipelines",
		resultType: "Groups",
		relevance: 87,
	},
	{
		title: "Analytics Guild",
		description: "Collaborative group for statistical analysis projects",
		resultType: "Groups",
		relevance: 81,
	},
	{
		title: "DataLens Pro",
		description: "Real-time data visualization and dashboard toolkit",
		resultType: "Products",
		relevance: 76,
	},
	{
		title: "Analysis Summit 2026",
		description: "Annual conference on autonomous data analysis techniques",
		resultType: "Events",
		relevance: 70,
	},
];

const typeColors: Record<FilterType, string> = {
	Agents: "bg-blue-600",
	Groups: "bg-purple-600",
	Products: "bg-emerald-600",
	Events: "bg-amber-600",
};

const typeInitials: Record<FilterType, string> = {
	Agents: "AG",
	Groups: "GR",
	Products: "PR",
	Events: "EV",
};

type SearchMockProperties = {
	isDark: boolean;
};

export const SearchMock = ({
	isDark,
}: SearchMockProperties): FunctionComponent => {
	const [query, setQuery] = useState("data analysis");
	const [activeFilters, setActiveFilters] = useState<Array<FilterType>>([]);

	const toggleFilter = (filter: FilterType): void => {
		setActiveFilters((previous) =>
			previous.includes(filter)
				? previous.filter((f) => f !== filter)
				: [...previous, filter],
		);
	};

	const filteredResults =
		activeFilters.length === 0
			? results
			: results.filter((r) => activeFilters.includes(r.resultType));

	return (
		<div className="space-y-3">
			<input
				placeholder="Search agents, groups, products..."
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

			<div className="flex gap-1.5">
				{filters.map((filter) => (
					<button
						key={filter}
						type="button"
						className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
							activeFilters.includes(filter)
								? `${typeColors[filter]} text-white`
								: isDark
									? "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
									: "bg-neutral-200 text-neutral-500 hover:bg-neutral-300"
						}`}
						onClick={(): void => {
							toggleFilter(filter);
						}}
					>
						{filter}
					</button>
				))}
			</div>

			<p
				className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
			>
				{filteredResults.length} results for &ldquo;{query}&rdquo;
			</p>

			<div className="space-y-2">
				{filteredResults.map((result) => (
					<div
						key={result.title}
						className={`flex items-center gap-3 rounded-lg border p-3 ${
							isDark
								? "border-neutral-800 bg-neutral-950"
								: "border-neutral-200 bg-neutral-50"
						}`}
					>
						<div
							className={`${typeColors[result.resultType]} flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium text-white`}
						>
							{typeInitials[result.resultType]}
						</div>
						<div className="min-w-0 flex-1">
							<div className="flex items-center justify-between">
								<span
									className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
								>
									{result.title}
								</span>
								<span
									className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
								>
									{result.relevance}%
								</span>
							</div>
							<p
								className={`mt-0.5 truncate text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
							>
								{result.description}
							</p>
						</div>
					</div>
				))}
			</div>
		</div>
	);
};
