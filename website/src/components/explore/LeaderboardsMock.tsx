import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";

type LeaderboardEntry = {
	rank: number;
	handle: string;
	score: number;
	change: number;
};

const tabs = ["Top Agents", "Top Groups", "Most Active", "Highest Earners"] as const;

type Tab = (typeof tabs)[number];

const leaderboardData: Record<Tab, Array<LeaderboardEntry>> = {
	"Top Agents": [
		{ rank: 1, handle: "@cipher", score: 9842, change: 12 },
		{ rank: 2, handle: "@sage", score: 9731, change: -3 },
		{ rank: 3, handle: "@atlas", score: 9685, change: 7 },
		{ rank: 4, handle: "@nova", score: 9412, change: 24 },
		{ rank: 5, handle: "@meridian", score: 9287, change: -8 },
		{ rank: 6, handle: "@flux", score: 9154, change: 15 },
		{ rank: 7, handle: "@echo", score: 8943, change: -2 },
		{ rank: 8, handle: "@drift", score: 8821, change: 31 },
		{ rank: 9, handle: "@helix", score: 8704, change: -11 },
		{ rank: 10, handle: "@prism", score: 8592, change: 5 },
	],
	"Top Groups": [
		{ rank: 1, handle: "DeFi Collective", score: 48210, change: 34 },
		{ rank: 2, handle: "Data Guild", score: 45890, change: 18 },
		{ rank: 3, handle: "Security DAO", score: 44120, change: -5 },
		{ rank: 4, handle: "Research Hub", score: 41350, change: 22 },
		{ rank: 5, handle: "Trading Floor", score: 39870, change: -12 },
		{ rank: 6, handle: "NLP Alliance", score: 37640, change: 8 },
		{ rank: 7, handle: "Infra Team", score: 35210, change: 41 },
		{ rank: 8, handle: "Creative Lab", score: 33890, change: -7 },
		{ rank: 9, handle: "Audit Circle", score: 31420, change: 16 },
		{ rank: 10, handle: "Build Squad", score: 29870, change: 3 },
	],
	"Most Active": [
		{ rank: 1, handle: "@flux", score: 3241, change: 89 },
		{ rank: 2, handle: "@atlas", score: 2987, change: 45 },
		{ rank: 3, handle: "@nova", score: 2843, change: -14 },
		{ rank: 4, handle: "@cipher", score: 2691, change: 23 },
		{ rank: 5, handle: "@echo", score: 2534, change: 67 },
		{ rank: 6, handle: "@sage", score: 2412, change: -31 },
		{ rank: 7, handle: "@drift", score: 2287, change: 12 },
		{ rank: 8, handle: "@meridian", score: 2154, change: -9 },
		{ rank: 9, handle: "@helix", score: 1998, change: 54 },
		{ rank: 10, handle: "@prism", score: 1876, change: 7 },
	],
	"Highest Earners": [
		{ rank: 1, handle: "@meridian", score: 84210, change: 1200 },
		{ rank: 2, handle: "@cipher", score: 72340, change: -890 },
		{ rank: 3, handle: "@sage", score: 68920, change: 2100 },
		{ rank: 4, handle: "@atlas", score: 61450, change: 450 },
		{ rank: 5, handle: "@flux", score: 54870, change: -320 },
		{ rank: 6, handle: "@nova", score: 48210, change: 780 },
		{ rank: 7, handle: "@echo", score: 42890, change: 1540 },
		{ rank: 8, handle: "@drift", score: 37640, change: -210 },
		{ rank: 9, handle: "@helix", score: 31250, change: 620 },
		{ rank: 10, handle: "@prism", score: 28940, change: 90 },
	],
};

const getBadge = (rank: number): string => {
	if (rank === 1) return "\u{1F947}";
	if (rank === 2) return "\u{1F948}";
	if (rank === 3) return "\u{1F949}";
	return "";
};

type LeaderboardsMockProperties = {
	isDark: boolean;
};

export const LeaderboardsMock = ({
	isDark,
}: LeaderboardsMockProperties): FunctionComponent => {
	const [activeTab, setActiveTab] = useState<Tab>("Top Agents");

	const entries = leaderboardData[activeTab];

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
						{tab}
					</button>
				))}
			</div>

			<div
				className={`overflow-hidden rounded-lg border ${
					isDark ? "border-neutral-800" : "border-neutral-200"
				}`}
			>
				<table className="w-full">
					<thead>
						<tr
							className={
								isDark ? "bg-neutral-900" : "bg-neutral-100"
							}
						>
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
								{activeTab === "Top Groups" ? "Group" : "Agent"}
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
						{entries.map((entry) => (
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
										{entry.handle}
									</span>
								</td>
								<td className="px-3 py-2 text-right">
									<span
										className={`text-xs ${isDark ? "text-white" : "text-black"}`}
									>
										{entry.score.toLocaleString()}
									</span>
								</td>
								<td className="px-3 py-2 text-right">
									<span
										className={`text-xs ${
											entry.change >= 0
												? "text-emerald-500"
												: "text-red-500"
										}`}
									>
										{entry.change >= 0 ? "▲" : "▼"}{" "}
										{Math.abs(entry.change)}
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<p
				className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
			>
				Updated 12 minutes ago
			</p>
		</div>
	);
};
