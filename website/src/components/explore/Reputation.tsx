"use client";

import type { LeaderboardEntry } from "@tinyhumansai/tinyplace";
import Link from "next/link";
import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";
import { Chip } from "@src/components/ui/Chip";
import { useLeaderboard } from "@src/hooks/use-reputation";

import { ReferralGraph } from "./ReferralGraph";

type ReputationProperties = {
	isDark: boolean;
};

const tabs = ["leaderboard", "graph"] as const;
type Tab = (typeof tabs)[number];
const tabLabels: Record<Tab, string> = {
	leaderboard: "Leaderboard",
	graph: "Referral graph",
};

const LeaderboardView = ({
	isDark,
}: ReputationProperties): FunctionComponent => {
	const { data, isLoading, isError, error } = useLeaderboard("reputation");

	const entries = data?.entries ?? [];
	const maxScore =
		entries.length > 0
			? Math.max(...entries.map((entry) => entry.score ?? 0))
			: 1;

	if (isLoading) {
		return (
			<div className="space-y-4">
				<div
					className={`flex items-center justify-center rounded-lg border p-8 ${
						isDark
							? "border-neutral-800 bg-neutral-950"
							: "border-neutral-200 bg-neutral-50"
					}`}
				>
					<p
						className={`text-sm ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						Loading reputation leaderboard...
					</p>
				</div>
			</div>
		);
	}

	if (isError) {
		return (
			<div className="space-y-4">
				<div
					className={`flex items-center justify-center rounded-lg border p-8 ${
						isDark
							? "border-neutral-800 bg-neutral-950"
							: "border-neutral-200 bg-neutral-50"
					}`}
				>
					<p className="text-sm text-red-500">
						Failed to load leaderboard
						{error instanceof Error ? `: ${error.message}` : ""}
					</p>
				</div>
			</div>
		);
	}

	if (entries.length === 0) {
		return (
			<div className="space-y-4">
				<div
					className={`flex items-center justify-center rounded-lg border p-8 ${
						isDark
							? "border-neutral-800 bg-neutral-950"
							: "border-neutral-200 bg-neutral-50"
					}`}
				>
					<p
						className={`text-sm ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						No reputation data available yet.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div
				className={`rounded-lg border p-4 ${
					isDark
						? "border-neutral-800 bg-neutral-950"
						: "border-neutral-200 bg-neutral-50"
				}`}
			>
				<p
					className={`mb-3 text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
				>
					Reputation Leaderboard
				</p>
				<div className="space-y-2.5">
					{entries.map((entry: LeaderboardEntry) => {
						const score = entry.score ?? 0;
						const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
						const displayName =
							entry.username ?? entry.cryptoId ?? `Rank ${String(entry.rank)}`;
						const profileHref = entry.username
							? `/@${entry.username.replace(/^@/, "")}`
							: entry.cryptoId
								? `/u/${encodeURIComponent(entry.cryptoId)}`
								: null;
						const rowClassName = `block border-b pb-2.5 last:border-0 last:pb-0 ${
							isDark ? "border-neutral-800" : "border-neutral-200"
						} ${profileHref ? "cursor-pointer hover:opacity-80" : ""}`;
						const rowBody = (
							<>
								<div className="mb-1 flex items-center justify-between">
									<div className="flex items-center gap-2">
										<span
											className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
												entry.rank <= 3
													? "bg-amber-500/20 text-amber-500"
													: isDark
														? "bg-neutral-800 text-neutral-400"
														: "bg-neutral-200 text-neutral-500"
											}`}
										>
											{entry.rank}
										</span>
										<span
											className={`text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
										>
											{displayName}
										</span>
									</div>
									<div className="flex items-center gap-2">
										<span
											className={`text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
										>
											{score}
										</span>
										{entry.delta !== undefined && entry.delta !== 0 && (
											<span
												className={`text-xs font-medium ${
													entry.delta > 0 ? "text-emerald-500" : "text-red-500"
												}`}
											>
												{entry.delta > 0 ? "+" : ""}
												{entry.delta}
											</span>
										)}
									</div>
								</div>
								<div
									className={`h-1.5 w-full overflow-hidden rounded-full ${
										isDark ? "bg-neutral-800" : "bg-neutral-200"
									}`}
								>
									<div
										style={{ width: `${String(percentage)}%` }}
										className={`h-full rounded-full ${
											entry.rank === 1
												? "bg-amber-500"
												: entry.rank === 2
													? "bg-neutral-400"
													: entry.rank === 3
														? "bg-amber-700"
														: "bg-emerald-500"
										}`}
									/>
								</div>
							</>
						);

						return profileHref ? (
							<Link
								key={entry.rank}
								className={rowClassName}
								href={profileHref}
							>
								{rowBody}
							</Link>
						) : (
							<div key={entry.rank} className={rowClassName}>
								{rowBody}
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
};

export const Reputation = ({
	isDark,
}: ReputationProperties): FunctionComponent => {
	const [activeTab, setActiveTab] = useState<Tab>("leaderboard");

	return (
		<div className="space-y-4">
			<div className="flex gap-1">
				{tabs.map((tab) => (
					<Chip
						key={tab}
						active={activeTab === tab}
						isDark={isDark}
						onClick={(): void => {
							setActiveTab(tab);
						}}
					>
						{tabLabels[tab]}
					</Chip>
				))}
			</div>
			{activeTab === "leaderboard" ? (
				<LeaderboardView isDark={isDark} />
			) : (
				<ReferralGraph isDark={isDark} />
			)}
		</div>
	);
};
