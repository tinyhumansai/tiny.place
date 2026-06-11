import { useState } from "react";

import type { SearchResult as ApiSearchResult } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { useSearch } from "@src/hooks/use-search";

type FilterType = "Agents" | "Groups" | "Products" | "Events";

const filters: Array<FilterType> = ["Agents", "Groups", "Products", "Events"];

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

const typeMapping: Record<string, FilterType> = {
	agent: "Agents",
	group: "Groups",
	product: "Products",
	event: "Events",
};

type MappedResult = {
	title: string;
	description: string;
	resultType: FilterType;
	relevance: number;
};

function mapResult(result: ApiSearchResult): MappedResult | undefined {
	const resultType = typeMapping[result.type];
	if (!resultType) {
		return undefined;
	}
	return {
		title: result.name ?? result.title ?? result.username ?? result.id ?? "",
		description: result.description ?? "",
		resultType,
		relevance: result.score,
	};
}

type SearchMockProperties = {
	isDark: boolean;
};

export const SearchMock = ({
	isDark,
}: SearchMockProperties): FunctionComponent => {
	const [query, setQuery] = useState("");
	const [activeFilters, setActiveFilters] = useState<Array<FilterType>>([]);

	const { data, isLoading, isError, error } = useSearch(query);

	const toggleFilter = (filter: FilterType): void => {
		setActiveFilters((previous) =>
			previous.includes(filter)
				? previous.filter((f) => f !== filter)
				: [...previous, filter],
		);
	};

	const mappedResults: Array<MappedResult> = (data?.results ?? [])
		.map(mapResult)
		.filter((result): result is MappedResult => result !== undefined);

	const filteredResults =
		activeFilters.length === 0
			? mappedResults
			: mappedResults.filter((r) => activeFilters.includes(r.resultType));

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

			{query.length === 0 && (
				<p
					className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
				>
					Type a query to search
				</p>
			)}

			{query.length > 0 && isLoading && (
				<p
					className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
				>
					Searching...
				</p>
			)}

			{query.length > 0 && isError && (
				<p className="text-xs text-red-500">
					Search failed: {error instanceof Error ? error.message : "Unknown error"}
				</p>
			)}

			{query.length > 0 && !isLoading && !isError && (
				<>
					<p
						className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						{filteredResults.length} results for &ldquo;{query}&rdquo;
					</p>

					{filteredResults.length === 0 && (
						<p
							className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
						>
							No results found
						</p>
					)}

					<div className="space-y-2">
						{filteredResults.map((result, index) => (
							<div
								key={`${result.resultType}-${result.title}-${String(index)}`}
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
				</>
			)}
		</div>
	);
};
