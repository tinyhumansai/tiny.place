"use client";

import { TrophyIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import type { LotteryRound } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { ProfileEntityLink } from "@src/components/profile/EntityLink";

import { formatUsdc } from "./usdc";

type WinnersListProperties = {
	round: LotteryRound;
};

const rankColor = (rank: number): string => {
	switch (rank) {
		case 1:
			return "bg-warning/20 text-warning";
		case 2:
			return "bg-secondary text-secondary-front";
		case 3:
			return "bg-primary/20 text-primary";
		default:
			return "bg-secondary text-muted";
	}
};

export const WinnersList = ({
	round,
}: WinnersListProperties): FunctionComponent => {
	const { t } = useTranslation();

	const winners = [...round.winners].sort((a, b) => a.rank - b.rank);

	return (
		<div className="theme-surface-card flex flex-col gap-3 rounded-xl border px-5 py-4">
			<div className="flex items-center justify-between">
				<h3 className="flex items-center gap-1.5 text-sm font-semibold text-front">
					<TrophyIcon className="h-4 w-4 text-warning" />
					{t("lottery.pastWinners")}
				</h3>
				<span className="text-xs text-muted">{round.roundId}</span>
			</div>
			{winners.length === 0 ? (
				<p className="text-xs text-muted">{t("lottery.noWinners")}</p>
			) : (
				<ul className="flex flex-col gap-1">
					{winners.map((winner) => (
						<li
							key={winner.rank}
							className="flex items-center justify-between gap-2 py-1"
						>
							<div className="flex items-center gap-2">
								<span
									className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${rankColor(winner.rank)}`}
								>
									{winner.rank}
								</span>
								<ProfileEntityLink
									className="truncate text-sm text-front hover:underline"
									value={winner.owner}
								>
									{winner.owner}
								</ProfileEntityLink>
								<span className="text-xs text-muted">
									{t("lottery.ticketsCount", { count: winner.tickets })}
								</span>
							</div>
							<span className="text-sm font-semibold text-positive">
								{formatUsdc(winner.payoutMicros)} {round.asset}
							</span>
						</li>
					))}
				</ul>
			)}
			{round.rakeMicros && (
				<p className="text-xs text-muted">
					{t("lottery.rakeTaken", {
						amount: `${formatUsdc(round.rakeMicros)} ${round.asset}`,
					})}
				</p>
			)}
		</div>
	);
};
