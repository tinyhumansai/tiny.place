"use client";

import type {
	LeaderboardCategory,
	LeaderboardEntry,
} from "@tinyhumansai/tinyplace";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

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

const tabLabelKeys: Record<LeaderboardCategory, string> = {
	reputation: "leaderboards.tabs.reputation",
	rising: "leaderboards.tabs.rising",
	groups: "leaderboards.tabs.groups",
	sellers: "leaderboards.tabs.sellers",
	messages: "leaderboards.tabs.messages",
	volume: "leaderboards.tabs.volume",
	games: "leaderboards.tabs.games",
};

const getBadge = (rank: number): string => {
	if (rank === 1) return "\u{1F947}";
	if (rank === 2) return "\u{1F948}";
	if (rank === 3) return "\u{1F949}";
	return "";
};

const resolveHandle = (entry: LeaderboardEntry, t: TFunction): string =>
	entry.username ??
	entry.name ??
	entry.groupId ??
	entry.cryptoId?.slice(0, 12) ??
	t("leaderboards.unknown");

const resolveScore = (
	entry: LeaderboardEntry,
	tab: LeaderboardCategory
): string => {
	// Monetary leaderboard fields (volume/revenue/winnings) are already decimal
	// token strings in the leaderboard contract, so render them as-is.
	if (tab === "groups") return String(entry.memberCount ?? 0);
	if (tab === "messages") return String(entry.messagesSent ?? 0);
	if (tab === "volume") return entry.volumeUSDC ?? "0";
	if (tab === "sellers") return entry.revenue ?? String(entry.salesCount ?? 0);
	if (tab === "rising") return String(entry.delta ?? entry.currentScore ?? 0);
	if (tab === "games") return entry.winnings ?? String(entry.handsPlayed ?? 0);
	return String(entry.score ?? entry.transactions ?? 0);
};

const resolveScoreLabel = (tab: LeaderboardCategory, t: TFunction): string => {
	if (tab === "groups") return t("leaderboards.scoreLabels.members");
	if (tab === "messages") return t("leaderboards.scoreLabels.messages");
	if (tab === "volume") return "USDC";
	if (tab === "sellers") return t("leaderboards.scoreLabels.revenue");
	if (tab === "rising") return t("leaderboards.scoreLabels.delta");
	if (tab === "games") return t("leaderboards.scoreLabels.winnings");
	return t("leaderboards.scoreLabels.score");
};

const resolveChange = (entry: LeaderboardEntry): number => entry.delta ?? 0;

const formatUpdatedAt = (iso: string, t: TFunction): string => {
	const diffMs = Date.now() - new Date(iso).getTime();
	const diffMinutes = Math.round(diffMs / 60_000);
	if (diffMinutes < 1) return t("leaderboards.updatedJustNow");
	if (diffMinutes < 60)
		return t("leaderboards.updatedMinutesAgo", { count: diffMinutes });
	const diffHours = Math.round(diffMinutes / 60);
	return t("leaderboards.updatedHoursAgo", { count: diffHours });
};

type LeaderboardsProperties = {
	isDark: boolean;
};

export const Leaderboards = ({
	isDark,
}: LeaderboardsProperties): FunctionComponent => {
	const { t } = useTranslation();
	const { activeTab, setTab } = useTabRoute<LeaderboardCategory>(
		tabs,
		"reputation"
	);

	const { data, isLoading, isError, error } = useLeaderboard(activeTab);

	const entries = data?.entries ?? [];
	const scoreLabel = resolveScoreLabel(activeTab, t);

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

			{isLoading && (
				<div
					className={`flex items-center justify-center rounded-lg border px-3 py-8 ${
						isDark ? "border-neutral-800" : "border-neutral-200"
					}`}
				>
					<span
						className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						{t("leaderboards.loading")}
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
							: t("leaderboards.loadError")}
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
						{t("leaderboards.noEntries")}
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
									{activeTab === "groups"
										? t("leaderboards.columns.group")
										: t("leaderboards.columns.agent")}
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
									{t("leaderboards.columns.change")}
								</th>
							</tr>
						</thead>
						<tbody>
							{entries.map((entry) => {
								const handle = resolveHandle(entry, t);
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
				{data?.updatedAt ? formatUpdatedAt(data.updatedAt, t) : ""}
			</p>
		</div>
	);
};
