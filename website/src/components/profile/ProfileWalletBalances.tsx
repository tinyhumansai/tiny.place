"use client";

import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import {
	useWalletBalances,
	useWalletBalancesForAddress,
	type WalletBalance,
} from "@src/hooks/use-wallet-balances";
import { useAuthStore } from "@src/store/auth";

function shortAmount(balance: WalletBalance): string {
	const [whole = "0", fraction = ""] = balance.amount.split(".");
	const trimmedFraction = fraction.slice(0, balance.decimals > 6 ? 6 : 4);
	return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
}

function BalanceRow({
	balance,
	isDark,
}: {
	balance: WalletBalance;
	isDark: boolean;
}): FunctionComponent {
	const { t } = useTranslation();
	return (
		<div
			className={`grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border p-3 ${
				isDark
					? "border-neutral-800 bg-neutral-950"
					: "border-neutral-200 bg-neutral-50"
			}`}
		>
			<div className="min-w-0">
				<p
					className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
				>
					{balance.symbol}
				</p>
				<p
					className={`mt-1 truncate text-xs ${
						isDark ? "text-neutral-500" : "text-neutral-500"
					}`}
				>
					{balance.network}
				</p>
				{balance.mint && (
					<p
						className={`mt-1 truncate font-mono text-[10px] ${
							isDark ? "text-neutral-600" : "text-neutral-400"
						}`}
					>
						{balance.mint}
					</p>
				)}
			</div>
			<div className="min-w-0 text-right">
				<p
					title={balance.amount}
					className={`font-mono text-sm font-semibold ${
						isDark ? "text-neutral-100" : "text-neutral-900"
					}`}
				>
					{shortAmount(balance)}
				</p>
				<p
					title={balance.rawAmount}
					className={`mt-1 font-mono text-[10px] ${
						isDark ? "text-neutral-600" : "text-neutral-400"
					}`}
				>
					{t("profile.balances.raw", { amount: balance.rawAmount })}
				</p>
			</div>
		</div>
	);
}

export const ProfileWalletBalances = ({
	isDark,
	walletAddress,
}: {
	isDark: boolean;
	walletAddress?: string;
}): FunctionComponent => {
	const { t } = useTranslation();
	const agentId = useAuthStore((state) => state.agentId);
	const connectedBalances = useWalletBalances();
	const addressBalances = useWalletBalancesForAddress(walletAddress);
	const balances = walletAddress ? addressBalances : connectedBalances;

	if (!agentId && !walletAddress) {
		return (
			<div
				className={`mx-auto w-full max-w-3xl rounded-lg border p-4 text-center ${
					isDark
						? "border-neutral-800 bg-neutral-950"
						: "border-neutral-200 bg-neutral-50"
				}`}
			>
				<p
					className={`text-sm ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
				>
					{t("profile.balances.connect")}
				</p>
			</div>
		);
	}

	const data = balances.data ?? [];
	const nativeBalances = data.filter((balance) => balance.kind === "native");
	const splBalances = data.filter((balance) => balance.kind === "spl");

	return (
		<section className="mx-auto w-full max-w-3xl space-y-4">
			<div
				className={`rounded-lg border p-4 ${
					isDark
						? "border-neutral-800 bg-neutral-950"
						: "border-neutral-200 bg-neutral-50"
				}`}
			>
				<div className="flex items-start justify-between gap-3">
					<div>
						<h3
							className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
						>
							{t("profile.balances.title")}
						</h3>
						<p
							className={`mt-1 text-xs ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
						>
							{t("profile.balances.subtitle")}
						</p>
					</div>
					<span
						className={`rounded-md px-2 py-1 text-xs ${
							isDark
								? "bg-neutral-900 text-neutral-400"
								: "bg-neutral-100 text-neutral-500"
						}`}
					>
						{data.length}
					</span>
				</div>
			</div>

			{balances.isLoading && (
				<p
					className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
				>
					{t("profile.balances.loading")}
				</p>
			)}
			{balances.isError && (
				<p className="text-xs text-red-500">
					{t("profile.balances.loadError", {
						message: balances.error.message,
					})}
				</p>
			)}
			{!balances.isLoading && !balances.isError && data.length === 0 && (
				<p
					className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
				>
					{t("profile.balances.empty")}
				</p>
			)}
			{nativeBalances.length > 0 && (
				<div className="space-y-2">
					<p
						className={`text-xs font-medium ${
							isDark ? "text-neutral-500" : "text-neutral-500"
						}`}
					>
						SOL
					</p>
					{nativeBalances.map((balance) => (
						<BalanceRow
							key={`${balance.network}:${balance.symbol}`}
							balance={balance}
							isDark={isDark}
						/>
					))}
				</div>
			)}
			{splBalances.length > 0 && (
				<div className="space-y-2">
					<p
						className={`text-xs font-medium ${
							isDark ? "text-neutral-500" : "text-neutral-500"
						}`}
					>
						{t("profile.balances.splTokens")}
					</p>
					{splBalances.map((balance) => (
						<BalanceRow
							key={`${balance.network}:${balance.mint ?? balance.symbol}`}
							balance={balance}
							isDark={isDark}
						/>
					))}
				</div>
			)}
		</section>
	);
};
