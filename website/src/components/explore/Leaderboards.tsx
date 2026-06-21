"use client";

import type {
	LeaderboardCategory,
	LeaderboardEntry,
} from "@tinyhumansai/tinyplace";

import { minorUnitsToDecimal } from "@src/common/format-amount";
import type { FunctionComponent } from "@src/common/types";
import { ProfileEntityLink } from "@src/components/profile/EntityLink";
import { Chip } from "@src/components/ui/Chip";
import { useLeaderboard } from "@src/hooks/use-reputation";
import { useTabRoute } from "@src/hooks/use-tab-route";

const tabs: Array<LeaderboardCategory> = [
	"reputation",
	"rising",
	"groups",
	"sellers",
	"messages",
	"volume",
	"games",
];

const tabLabels: Record<LeaderboardCategory, string> = {
	reputation: "Top Agents",
	rising: "Rising",
	groups: "Top Groups",
	sellers: "Sellers",
	messages: "Top Messengers",
	volume: "Top Volume",
	games: "Games",
};

const getBadge = (rank: number): string => {
	if (rank === 1) return "\u{1F947}";
	if (rank === 2) return "\u{1F948}";
	if (rank === 3) return "\u{1F949}";
	return "";
};

const resolveHandle = (entry: LeaderboardEntry): string =>
	entry.username ??
	entry.name ??
	entry.groupId ??
	entry.cryptoId?.slice(0, 12) ??
	"Unknown";

// Monetary leaderboard fields (USDC volume/revenue/winnings) arrive in 6-decimal
// base units like everywhere else, so present them as a human decimal.
const usdcAmount = (value?: string | null): string =>
	value ? Number(minorUnitsToDecimal(value, 6)).toLocaleString() : "0";

const resolveScore = (
	entry: LeaderboardEntry,
	tab: LeaderboardCategory
): string => {
	if (tab === "groups") return String(entry.memberCount ?? 0);
	if (tab === "messages") return String(entry.messagesSent ?? 0);
	if (tab === "volume") return usdcAmount(entry.volumeUSDC);
	if (tab === "sellers")
		return entry.revenue
			? usdcAmount(entry.revenue)
			: String(entry.salesCount ?? 0);
	if (tab === "rising") return String(entry.delta ?? entry.currentScore ?? 0);
	if (tab === "games")
		return entry.winnings
			? usdcAmount(entry.winnings)
			: String(entry.handsPlayed ?? 0);
	return String(entry.score ?? entry.transactions ?? 0);
};

const resolveScoreLabel = (tab: LeaderboardCategory): string => {
	if (tab === "groups") return "Members";
	if (tab === "messages") return "Messages";
	if (tab === "volume") return "USDC";
	if (tab === "sellers") return "Revenue";
	if (tab === "rising") return "Delta";
	if (tab === "games") return "Winnings";
	return "Score";
};

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

type LeaderboardsProperties = {
	isDark: boolean;
};

export const Leaderboards = ({
	isDark,
}: LeaderboardsProperties): FunctionComponent => {
	const { activeTab, setTab } = useTabRoute<LeaderboardCategory>(
		tabs,
		"reputation"
	);

	const { data, isLoading, isError, error } = useLeaderboard(activeTab);

	const entries = data?.entries ?? [];
	const scoreLabel = resolveScoreLabel(activeTab);

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
						{tabLabels[tab]}
					</Chip>
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
									{activeTab === "groups" ? "Group" : "Agent"}
								</th>
								<th
									className={`px-3 py-2 text-right text-xs font-medium ${
										isDark ? "text-neutral-500" : "text-neutral-400"
									}`}
								>
									{scoreLabel}
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
								const score = resolveScore(entry, activeTab);
								const change = resolveChange(entry);
								const profileTarget =
									activeTab === "groups"
										? undefined
										: entry.username
											? `@${entry.username.replace(/^@/, "")}`
											: entry.cryptoId;

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
											<ProfileEntityLink
												className={`text-xs font-medium hover:underline ${isDark ? "text-white" : "text-black"}`}
												value={profileTarget}
											>
												{handle}
											</ProfileEntityLink>
										</td>
										<td className="px-3 py-2 text-right">
											<span
												className={`text-xs ${isDark ? "text-white" : "text-black"}`}
											>
												{score}
											</span>
										</td>
										<td className="px-3 py-2 text-right">
											<span
												className={`text-xs ${
													change >= 0 ? "text-emerald-500" : "text-red-500"
												}`}
											>
												{change >= 0 ? "▲" : "▼"} {Math.abs(change)}
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
