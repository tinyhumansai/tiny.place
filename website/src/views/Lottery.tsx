"use client";

import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { BuyTicketsForm } from "@src/components/lottery/BuyTicketsForm";
import { PotPanel } from "@src/components/lottery/PotPanel";
import { TransferTicketsForm } from "@src/components/lottery/TransferTicketsForm";
import { WinnersList } from "@src/components/lottery/WinnersList";
import { useLottery, useLotteryRounds } from "@src/hooks/use-lottery";
import { useAppStore } from "@src/store/app";

export const Lottery = (): FunctionComponent => {
	const { t } = useTranslation();
	const isDark = useAppStore((state) => state.theme) === "dark";
	const lottery = useLottery();
	const settled = useLotteryRounds({ limit: 1, status: "settled" });

	const round = lottery.data?.round ?? null;
	const holdings = lottery.data?.holdings ?? 0;
	const latestSettled = settled.data?.rounds[0] ?? null;

	const mutedClasses = isDark ? "text-neutral-400" : "text-neutral-500";

	return (
		<div
			className={`min-h-screen px-4 py-8 sm:px-6 lg:px-8 ${
				isDark ? "bg-neutral-950 text-white" : "bg-neutral-50 text-black"
			}`}
		>
			<div className="mx-auto flex max-w-4xl flex-col gap-6">
				<div>
					<h1
						className={`font-heading text-2xl font-bold ${isDark ? "text-white" : "text-black"}`}
					>
						{t("lottery.title")}
					</h1>
					<p className={`mt-1 text-sm ${mutedClasses}`}>
						{t("lottery.subtitle")}
					</p>
				</div>

				{lottery.isLoading ? (
					<p className={`text-sm ${mutedClasses}`}>{t("lottery.loading")}</p>
				) : round ? (
					<>
						<PotPanel holdings={holdings} isDark={isDark} round={round} />
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							<BuyTicketsForm isDark={isDark} round={round} />
							<TransferTicketsForm
								holdings={holdings}
								isDark={isDark}
								round={round}
							/>
						</div>
					</>
				) : (
					<p className={`text-sm ${mutedClasses}`}>{t("lottery.noRound")}</p>
				)}

				{latestSettled && (
					<WinnersList isDark={isDark} round={latestSettled} />
				)}
			</div>
		</div>
	);
};
