"use client";

import { TicketIcon, UsersIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import type { LotteryRound } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";

import { Countdown } from "./Countdown";
import { formatUsdc } from "./usdc";

type PotPanelProperties = {
	holdings: number;
	round: LotteryRound;
};

export const PotPanel = ({
	holdings,
	round,
}: PotPanelProperties): FunctionComponent => {
	const { t } = useTranslation();

	return (
		<div className="theme-surface-card flex flex-col gap-6 rounded-xl border px-6 py-5">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div className="flex flex-col">
					<span className="text-xs uppercase tracking-wide text-subtle">
						{t("lottery.pot")}
					</span>
					<span className="font-heading text-4xl font-bold text-positive">
						{formatUsdc(round.potMicros)}
						<span className="ml-2 text-lg font-medium text-positive">
							{round.asset}
						</span>
					</span>
				</div>
				<Countdown cutoffAt={round.cutoffAt} />
			</div>

			<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
				<div className="flex flex-col">
					<span className="flex items-center gap-1 text-xs text-subtle">
						<TicketIcon className="h-3.5 w-3.5" />
						{t("lottery.tickets")}
					</span>
					<span className="text-lg font-semibold text-front">
						{round.ticketCount.toLocaleString()}
					</span>
				</div>
				<div className="flex flex-col">
					<span className="flex items-center gap-1 text-xs text-subtle">
						<UsersIcon className="h-3.5 w-3.5" />
						{t("lottery.participants")}
					</span>
					<span className="text-lg font-semibold text-front">
						{round.participantCount.toLocaleString()}
					</span>
				</div>
				<div className="flex flex-col">
					<span className="text-xs text-subtle">
						{t("lottery.yourTickets")}
					</span>
					<span className="text-lg font-semibold text-warning">
						{holdings.toLocaleString()}
					</span>
				</div>
				<div className="flex flex-col">
					<span className="text-xs text-subtle">{t("lottery.rake")}</span>
					<span className="text-lg font-semibold text-front">
						{(round.feeBps / 100).toFixed(2)}%
					</span>
				</div>
			</div>
		</div>
	);
};
