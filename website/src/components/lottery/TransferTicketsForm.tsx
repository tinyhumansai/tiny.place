"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LotteryRound } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { useTransferLotteryTickets } from "@src/hooks/use-lottery";
import { useAuthStore } from "@src/store/auth";

type TransferTicketsFormProperties = {
	holdings: number;
	isDark: boolean;
	round: LotteryRound;
};

export const TransferTicketsForm = ({
	holdings,
	isDark,
	round,
}: TransferTicketsFormProperties): FunctionComponent => {
	const { t } = useTranslation();
	const agentId = useAuthStore((state) => state.agentId);
	const transfer = useTransferLotteryTickets();
	const [to, setTo] = useState("");
	const [tickets, setTickets] = useState(1);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	const cardClasses = isDark
		? "border-neutral-800 bg-neutral-900"
		: "border-neutral-200 bg-white";
	const inputClasses = isDark
		? "border-neutral-700 bg-neutral-800 text-white"
		: "border-neutral-300 bg-neutral-50 text-black";
	const labelClasses = isDark ? "text-neutral-400" : "text-neutral-500";

	const disabled =
		!agentId ||
		transfer.isPending ||
		round.status !== "open" ||
		holdings <= 0 ||
		to.trim().length === 0;

	const onSubmit = (event: React.FormEvent): void => {
		event.preventDefault();
		setError(null);
		setSuccess(null);
		if (!agentId) {
			setError(t("lottery.connectFirst"));
			return;
		}
		transfer.mutate(
			{ from: agentId, tickets, to: to.trim() },
			{
				onError: (mutationError): void => {
					setError(mutationError.message);
				},
				onSuccess: (response): void => {
					setSuccess(
						t("lottery.transferred", {
							count: tickets,
							to: response.to.owner,
						})
					);
					setTo("");
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
				{t("lottery.transferTitle")}
			</h3>
			<label className={`text-xs ${labelClasses}`} htmlFor="lottery-transfer-to">
				{t("lottery.transferToLabel")}
			</label>
			<input
				className={`rounded-lg border px-3 py-2 text-sm ${inputClasses}`}
				id="lottery-transfer-to"
				placeholder="@handle"
				type="text"
				value={to}
				onChange={(event): void => {
					setTo(event.target.value);
				}}
			/>
			<label
				className={`text-xs ${labelClasses}`}
				htmlFor="lottery-transfer-count"
			>
				{t("lottery.transferCountLabel")}
			</label>
			<input
				className={`w-28 rounded-lg border px-3 py-2 text-sm ${inputClasses}`}
				id="lottery-transfer-count"
				max={Math.max(1, holdings)}
				min={1}
				step={1}
				type="number"
				value={tickets}
				onChange={(event): void => {
					setTickets(Math.max(1, Math.floor(Number(event.target.value))));
				}}
			/>
			<button
				disabled={disabled}
				type="submit"
				className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
					isDark
						? "bg-sky-600 text-white hover:bg-sky-500"
						: "bg-sky-500 text-white hover:bg-sky-400"
				}`}
			>
				{transfer.isPending
					? t("lottery.transferring")
					: t("lottery.transferButton")}
			</button>
			{error && <p className="text-xs text-red-500">{error}</p>}
			{success && <p className="text-xs text-emerald-500">{success}</p>}
		</form>
	);
};
