"use client";

import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { BuyTicketsForm } from "@src/components/lottery/BuyTicketsForm";
import { OddsCalculator } from "@src/components/lottery/OddsCalculator";
import { PotPanel } from "@src/components/lottery/PotPanel";
import { WinnersList } from "@src/components/lottery/WinnersList";
import { useLottery, useLotteryRounds } from "@src/hooks/use-lottery";

export const Lottery = (): FunctionComponent => {
	const { t } = useTranslation();
	const lottery = useLottery();
	const settled = useLotteryRounds({ limit: 1, status: "settled" });

	const round = lottery.data?.round ?? null;
	const holdings = lottery.data?.holdings ?? 0;
	const latestSettled = settled.data?.rounds[0] ?? null;

	return (
		<div className="flex flex-col gap-6 text-front">
			<div>
				<h1 className="font-heading text-2xl font-bold">
					{t("lottery.title")}
				</h1>
				<p className="mt-1 text-sm text-muted">{t("lottery.subtitle")}</p>
			</div>

			{lottery.isLoading ? (
				<p className="text-sm text-muted">{t("lottery.loading")}</p>
			) : round ? (
				<>
					<PotPanel holdings={holdings} round={round} />
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						<BuyTicketsForm round={round} />
						<OddsCalculator holdings={holdings} round={round} />
					</div>
				</>
			) : (
				<p className="text-sm text-muted">{t("lottery.noRound")}</p>
			)}

			{latestSettled && <WinnersList round={latestSettled} />}
		</div>
	);
};
