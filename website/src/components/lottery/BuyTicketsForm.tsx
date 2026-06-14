"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LotteryRound } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { useBuyLotteryTickets } from "@src/hooks/use-lottery";
import { useAuthStore } from "@src/store/auth";

import { usdcToMicros } from "./usdc";

type BuyTicketsFormProperties = {
	isDark: boolean;
	round: LotteryRound;
};

export const BuyTicketsForm = ({
	isDark,
	round,
}: BuyTicketsFormProperties): FunctionComponent => {
	const { t } = useTranslation();
	const agentId = useAuthStore((state) => state.agentId);
	const buyTickets = useBuyLotteryTickets();
	const [amount, setAmount] = useState(1);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	const cardClasses = isDark
		? "border-neutral-800 bg-neutral-900"
		: "border-neutral-200 bg-white";
	const inputClasses = isDark
		? "border-neutral-700 bg-neutral-800 text-white"
		: "border-neutral-300 bg-neutral-50 text-black";
	const labelClasses = isDark ? "text-neutral-400" : "text-neutral-500";

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
					setSuccess(
						t("lottery.boughtTickets", { count: response.tickets })
					);
				},
			}
		);
	};

	return (
		<form
			className={`flex flex-col gap-3 rounded-xl border px-5 py-4 ${cardClasses}`}
			onSubmit={onSubmit}
		>
			<h3 className={`text-sm font-semibold ${isDark ? "text-white" : "text-black"}`}>
				{t("lottery.buyTitle")}
			</h3>
			<label className={`text-xs ${labelClasses}`} htmlFor="lottery-buy-amount">
				{t("lottery.buyAmountLabel")}
			</label>
			<div className="flex items-center gap-2">
				<input
					className={`w-28 rounded-lg border px-3 py-2 text-sm ${inputClasses}`}
					id="lottery-buy-amount"
					min={1}
					step={1}
					type="number"
					value={amount}
					onChange={(event): void => {
						setAmount(Math.max(1, Math.floor(Number(event.target.value))));
					}}
				/>
				<span className={`text-sm ${labelClasses}`}>
					{t("lottery.usdcEqualsTickets", { count: amount })}
				</span>
			</div>
			<button
				disabled={disabled}
				type="submit"
				className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
					isDark
						? "bg-emerald-600 text-white hover:bg-emerald-500"
						: "bg-emerald-500 text-white hover:bg-emerald-400"
				}`}
			>
				{buyTickets.isPending ? t("lottery.buying") : t("lottery.buyButton")}
			</button>
			{!agentId && (
				<p className={`text-xs ${labelClasses}`}>{t("lottery.connectFirst")}</p>
			)}
			{error && <p className="text-xs text-red-500">{error}</p>}
			{success && <p className="text-xs text-emerald-500">{success}</p>}
		</form>
	);
};
