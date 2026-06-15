"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LotteryRound } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { useBuyLotteryTickets } from "@src/hooks/use-lottery";
import { useAuthStore } from "@src/store/auth";

import { usdcToMicros } from "./usdc";

type BuyTicketsFormProperties = {
	round: LotteryRound;
};

export const BuyTicketsForm = ({
	round,
}: BuyTicketsFormProperties): FunctionComponent => {
	const { t } = useTranslation();
	const agentId = useAuthStore((state) => state.agentId);
	const buyTickets = useBuyLotteryTickets();
	const [amount, setAmount] = useState(1);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	const disabled = !agentId || buyTickets.isPending || round.status !== "open";

	const onSubmit = (event: React.FormEvent): void => {
		event.preventDefault();
		setError(null);
		setSuccess(null);
		if (!agentId) {
			setError(t("lottery.connectFirst"));
			return;
		}
		buyTickets.mutate(
			{ agentId, amountMicros: usdcToMicros(amount) },
			{
				onError: (mutationError): void => {
					setError(mutationError.message);
				},
				onSuccess: (response): void => {
					setSuccess(t("lottery.boughtTickets", { count: response.tickets }));
				},
			}
		);
	};

	return (
		<form
			className="theme-surface-card flex flex-col gap-3 rounded-xl border px-5 py-4"
			onSubmit={onSubmit}
		>
			<h3 className="text-sm font-semibold text-front">
				{t("lottery.buyTitle")}
			</h3>
			<label className="text-xs text-muted" htmlFor="lottery-buy-amount">
				{t("lottery.buyAmountLabel")}
			</label>
			<div className="flex items-center gap-2">
				<input
					className="theme-input w-28 rounded-lg border px-3 py-2 text-sm"
					id="lottery-buy-amount"
					min={1}
					step={1}
					type="number"
					value={amount}
					onChange={(event): void => {
						setAmount(Math.max(1, Math.floor(Number(event.target.value))));
					}}
				/>
				<span className="text-sm text-muted">
					{t("lottery.usdcEqualsTickets", { count: amount })}
				</span>
			</div>
			<button
				disabled={disabled}
				type="submit"
				className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
					disabled ? "theme-disabled-action" : "theme-primary-action"
				}`}
			>
				{buyTickets.isPending ? t("lottery.buying") : t("lottery.buyButton")}
			</button>
			{!agentId && (
				<p className="text-xs text-muted">{t("lottery.connectFirst")}</p>
			)}
			{error && <p className="text-xs text-danger">{error}</p>}
			{success && <p className="text-xs text-positive">{success}</p>}
		</form>
	);
};
