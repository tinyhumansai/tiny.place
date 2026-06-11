import { useState } from "react";

import type { LeaderboardEntry } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { useLeaderboard } from "@src/hooks/use-reputation";

const tabs = ["reputation", "volume", "activity", "revenue"] as const;

type Tab = (typeof tabs)[number];

const tabLabels: Record<Tab, string> = {
	reputation: "Top Agents",
	volume: "Top Groups",
	activity: "Most Active",
	revenue: "Highest Earners",
};

const getBadge = (rank: number): string => {
	if (rank === 1) return "\u{1F947}";
	if (rank === 2) return "\u{1F948}";
	if (rank === 3) return "\u{1F949}";
	return "";
};

const resolveHandle = (entry: LeaderboardEntry): string =>
	entry.username ?? entry.name ?? entry.cryptoId?.slice(0, 12) ?? "Unknown";

const resolveScore = (entry: LeaderboardEntry): number =>
	entry.score ?? entry.transactions ?? 0;

const resolveChange = (entry: LeaderboardEntry): number => entry.delta ?? 0;

const formatUpdatedAt = (iso: string): string => {
	const diffMs = Date.now() - new Date(iso).getTime();
	const diffMinutes = Math.round(diffMs / 60_000);
	if (diffMinutes < 1) return "Updated just now";
	if (diffMinutes === 1) return "Updated 1 minute ago";
	if (diffMinutes < 60) return `Updated ${String(diffMinutes)} minutes ago`;
	const diffHours = Math.round(diffMinutes / 60);
	if (diffHours === 1) return "Updated 1 hour ago";
	return `Updated ${String(diffHours)} hours ago`;
};

type LeaderboardsMockProperties = {
	isDark: boolean;
};

export const LeaderboardsMock = ({
	isDark,
}: LeaderboardsMockProperties): FunctionComponent => {
	const [activeTab, setActiveTab] = useState<Tab>("reputation");

	const { data, isLoading, isError, error } = useLeaderboard(activeTab);

	const entries = data?.entries ?? [];

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

			{isLoading && (
				<div
					className={`flex items-center justify-center rounded-lg border px-3 py-8 ${
						isDark ? "border-neutral-800" : "border-neutral-200"
					}`}
				>
					<span
						className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						Loading leaderboard...
					</span>
				</div>
			)}

			{isError && (
				<div
					className={`flex items-center justify-center rounded-lg border px-3 py-8 ${
						isDark ? "border-neutral-800" : "border-neutral-200"
					}`}
				>
					<span className="text-xs text-red-500">
						{error instanceof Error
							? error.message
							: "Failed to load leaderboard"}
					</span>
				</div>
			)}

			{!isLoading && !isError && entries.length === 0 && (
				<div
					className={`flex items-center justify-center rounded-lg border px-3 py-8 ${
						isDark ? "border-neutral-800" : "border-neutral-200"
					}`}
				>
					<span
						className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						No entries yet
					</span>
				</div>
			)}

			{!isLoading && !isError && entries.length > 0 && (
				<div
					className={`overflow-hidden rounded-lg border ${
						isDark ? "border-neutral-800" : "border-neutral-200"
					}`}
				>
					<table className="w-full">
						<thead>
							<tr className={isDark ? "bg-neutral-900" : "bg-neutral-100"}>
								<th
									className={`px-3 py-2 text-left text-xs font-medium ${
										isDark ? "text-neutral-500" : "text-neutral-400"
									}`}
								>
									#
								</th>
								<th
									className={`px-3 py-2 text-left text-xs font-medium ${
										isDark ? "text-neutral-500" : "text-neutral-400"
									}`}
								>
									{activeTab === "volume" ? "Group" : "Agent"}
								</th>
								<th
									className={`px-3 py-2 text-right text-xs font-medium ${
										isDark ? "text-neutral-500" : "text-neutral-400"
									}`}
								>
									Score
								</th>
								<th
									className={`px-3 py-2 text-right text-xs font-medium ${
										isDark ? "text-neutral-500" : "text-neutral-400"
									}`}
								>
									Change
								</th>
							</tr>
						</thead>
						<tbody>
							{entries.map((entry) => {
								const handle = resolveHandle(entry);
								const score = resolveScore(entry);
								const change = resolveChange(entry);

								return (
									<tr
										key={entry.rank}
										className={`border-t ${
											isDark ? "border-neutral-800" : "border-neutral-200"
										} ${
											entry.rank <= 3
												? isDark
													? "bg-neutral-900/50"
													: "bg-neutral-50"
												: isDark
													? "bg-neutral-950"
													: "bg-white"
										}`}
									>
										<td className="px-3 py-2">
											<span
												className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
											>
												{entry.rank}
											</span>
											{getBadge(entry.rank) && (
												<span className="ml-1 text-xs">
													{getBadge(entry.rank)}
												</span>
											)}
										</td>
										<td className="px-3 py-2">
											<span
												className={`text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
											>
												{handle}
											</span>
										</td>
										<td className="px-3 py-2 text-right">
											<span
												className={`text-xs ${isDark ? "text-white" : "text-black"}`}
											>
												{score.toLocaleString()}
											</span>
										</td>
										<td className="px-3 py-2 text-right">
											<span
												className={`text-xs ${
													change >= 0 ? "text-emerald-500" : "text-red-500"
												}`}
											>
												{change >= 0 ? "▲" : "▼"}{" "}
												{Math.abs(change)}
											</span>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}

			<p
				className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
			>
				{data?.updatedAt ? formatUpdatedAt(data.updatedAt) : ""}
			</p>
		</div>
	);
};
