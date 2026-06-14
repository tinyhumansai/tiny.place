"use client";

import { TicketIcon, UsersIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import type { LotteryRound } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";

import { Countdown } from "./Countdown";
import { formatUsdc } from "./usdc";

type PotPanelProperties = {
	holdings: number;
	isDark: boolean;
	round: LotteryRound;
};

export const PotPanel = ({
	holdings,
	isDark,
	round,
}: PotPanelProperties): FunctionComponent => {
	const { t } = useTranslation();

	const cardClasses = isDark
		? "border-neutral-800 bg-neutral-900"
		: "border-neutral-200 bg-white";
	const labelClasses = isDark ? "text-neutral-500" : "text-neutral-400";
	const valueClasses = isDark ? "text-white" : "text-black";

	return (
		<div
			className={`flex flex-col gap-6 rounded-xl border px-6 py-5 ${cardClasses}`}
		>
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div className="flex flex-col">
					<span
						className={`text-xs uppercase tracking-wide ${labelClasses}`}
					>
						{t("lottery.pot")}
					</span>
					<span className="font-heading text-4xl font-bold text-emerald-500">
						{formatUsdc(round.potMicros)}
						<span className="ml-2 text-lg font-medium text-emerald-600">
							{round.asset}
						</span>
					</span>
				</div>
				<Countdown cutoffAt={round.cutoffAt} isDark={isDark} />
			</div>

			<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
				<div className="flex flex-col">
					<span
						className={`flex items-center gap-1 text-xs ${labelClasses}`}
					>
						<TicketIcon className="h-3.5 w-3.5" />
						{t("lottery.tickets")}
					</span>
					<span className={`text-lg font-semibold ${valueClasses}`}>
						{round.ticketCount.toLocaleString()}
					</span>
				</div>
				<div className="flex flex-col">
					<span
						className={`flex items-center gap-1 text-xs ${labelClasses}`}
					>
						<UsersIcon className="h-3.5 w-3.5" />
						{t("lottery.participants")}
					</span>
					<span className={`text-lg font-semibold ${valueClasses}`}>
						{round.participantCount.toLocaleString()}
					</span>
				</div>
				<div className="flex flex-col">
					<span className={`text-xs ${labelClasses}`}>
						{t("lottery.yourTickets")}
					</span>
					<span className="text-lg font-semibold text-amber-500">
						{holdings.toLocaleString()}
					</span>
				</div>
				<div className="flex flex-col">
					<span className={`text-xs ${labelClasses}`}>
						{t("lottery.rake")}
					</span>
					<span className={`text-lg font-semibold ${valueClasses}`}>
						{(round.feeBps / 100).toFixed(2)}%
					</span>
				</div>
			</div>
		</div>
	);
};
