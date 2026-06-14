"use client";

import { TrophyIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import type { LotteryRound } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";

import { formatUsdc } from "./usdc";

type WinnersListProperties = {
	isDark: boolean;
	round: LotteryRound;
};

const rankColor = (rank: number, isDark: boolean): string => {
	switch (rank) {
		case 1:
			return isDark
				? "bg-amber-500/20 text-amber-400"
				: "bg-amber-100 text-amber-700";
		case 2:
			return isDark
				? "bg-neutral-500/20 text-neutral-300"
				: "bg-neutral-200 text-neutral-600";
		case 3:
			return isDark
				? "bg-orange-500/20 text-orange-400"
				: "bg-orange-100 text-orange-700";
		default:
			return isDark
				? "bg-neutral-800 text-neutral-400"
				: "bg-neutral-100 text-neutral-500";
	}
};

export const WinnersList = ({
	isDark,
	round,
}: WinnersListProperties): FunctionComponent => {
	const { t } = useTranslation();

	const cardClasses = isDark
		? "border-neutral-800 bg-neutral-900"
		: "border-neutral-200 bg-white";
	const labelClasses = isDark ? "text-neutral-400" : "text-neutral-500";

	const winners = [...round.winners].sort((a, b) => a.rank - b.rank);

	return (
		<div className={`flex flex-col gap-3 rounded-xl border px-5 py-4 ${cardClasses}`}>
			<div className="flex items-center justify-between">
				<h3
					className={`flex items-center gap-1.5 text-sm font-semibold ${isDark ? "text-white" : "text-black"}`}
				>
					<TrophyIcon className="h-4 w-4 text-amber-500" />
					{t("lottery.pastWinners")}
				</h3>
				<span className={`text-xs ${labelClasses}`}>{round.roundId}</span>
			</div>
			{winners.length === 0 ? (
				<p className={`text-xs ${labelClasses}`}>{t("lottery.noWinners")}</p>
			) : (
				<ul className="flex flex-col gap-1">
					{winners.map((winner) => (
						<li
							key={winner.rank}
							className="flex items-center justify-between gap-2 py-1"
						>
							<div className="flex items-center gap-2">
								<span
									className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${rankColor(winner.rank, isDark)}`}
								>
									{winner.rank}
								</span>
								<span
									className={`truncate text-sm ${isDark ? "text-white" : "text-black"}`}
								>
									{winner.owner}
								</span>
								<span className={`text-xs ${labelClasses}`}>
									{t("lottery.ticketsCount", { count: winner.tickets })}
								</span>
							</div>
							<span className="text-sm font-semibold text-emerald-500">
								{formatUsdc(winner.payoutMicros)} {round.asset}
							</span>
						</li>
					))}
				</ul>
			)}
			{round.rakeMicros && (
				<p className={`text-xs ${labelClasses}`}>
					{t("lottery.rakeTaken", {
						amount: `${formatUsdc(round.rakeMicros)} ${round.asset}`,
					})}
				</p>
			)}
		</div>
	);
};
