"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LotteryRound } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";

type OddsCalculatorProperties = {
	holdings: number;
	round: LotteryRound;
};

type OddsEstimate = {
	playerTickets: number;
	totalTickets: number;
	winnerSlots: number;
	winProbability: number;
};

function clampWinnerSlots(round: LotteryRound, totalTickets: number): number {
	const estimatedParticipants = Math.max(round.participantCount, 1);
	const fraction = round.winnerFractionBps / 10_000;
	const configuredSlots = Math.ceil(estimatedParticipants * fraction);
	return Math.max(
		1,
		Math.min(
			round.maxWinners,
			estimatedParticipants,
			totalTickets,
			configuredSlots
		)
	);
}

function estimateOdds(
	round: LotteryRound,
	holdings: number,
	additionalTickets: number
): OddsEstimate {
	const playerTickets = Math.max(0, holdings + additionalTickets);
	const otherTickets = Math.max(0, round.ticketCount - holdings);
	const totalTickets = otherTickets + playerTickets;
	const winnerSlots = clampWinnerSlots(round, totalTickets);
	const loseProbability =
		totalTickets <= 0 || playerTickets <= 0
			? 1
			: Math.pow(1 - playerTickets / totalTickets, winnerSlots);

	return {
		playerTickets,
		totalTickets,
		winnerSlots,
		winProbability: 1 - loseProbability,
	};
}

function formatPercent(value: number): string {
	return (value * 100).toLocaleString(undefined, {
		maximumFractionDigits: value < 0.01 && value > 0 ? 2 : 1,
		minimumFractionDigits: 0,
	});
}

export const OddsCalculator = ({
	holdings,
	round,
}: OddsCalculatorProperties): FunctionComponent => {
	const { t } = useTranslation();
	const [additionalTickets, setAdditionalTickets] = useState(1);
	const estimate = useMemo(
		() => estimateOdds(round, holdings, additionalTickets),
		[additionalTickets, holdings, round]
	);

	return (
		<section className="theme-surface-card flex flex-col gap-4 rounded-xl border px-5 py-4">
			<div>
				<h3 className="text-sm font-semibold text-front">
					{t("lottery.oddsTitle")}
				</h3>
				<p className="mt-1 text-xs text-muted">{t("lottery.oddsSubtitle")}</p>
			</div>
			<label className="text-xs text-muted" htmlFor="lottery-odds-tickets">
				{t("lottery.oddsTicketsLabel")}
			</label>
			<input
				className="theme-input w-28 rounded-lg border px-3 py-2 text-sm"
				id="lottery-odds-tickets"
				min={0}
				step={1}
				type="number"
				value={additionalTickets}
				onChange={(event): void => {
					setAdditionalTickets(
						Math.max(0, Math.floor(Number(event.target.value) || 0))
					);
				}}
			/>
			<div className="grid grid-cols-2 gap-3">
				<div className="flex flex-col rounded-lg border border-border px-3 py-2">
					<span className="text-xs text-subtle">{t("lottery.oddsChance")}</span>
					<span className="text-xl font-semibold text-positive">
						{formatPercent(estimate.winProbability)}%
					</span>
				</div>
				<div className="flex flex-col rounded-lg border border-border px-3 py-2">
					<span className="text-xs text-subtle">
						{t("lottery.oddsWinnerSlots")}
					</span>
					<span className="text-xl font-semibold text-front">
						{estimate.winnerSlots.toLocaleString()}
					</span>
				</div>
			</div>
			<p className="text-xs text-muted">
				{t("lottery.oddsSummary", {
					playerTickets: estimate.playerTickets,
					totalTickets: estimate.totalTickets,
				})}
			</p>
			<p className="text-xs text-subtle">{t("lottery.oddsDisclaimer")}</p>
		</section>
	);
};
