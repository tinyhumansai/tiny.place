"use client";

import type { FunctionComponent } from "@src/common/types";
import {
	useWalletBalances,
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
					raw {balance.rawAmount}
				</p>
			</div>
		</div>
	);
}

export const ProfileWalletBalances = ({
	isDark,
}: {
	isDark: boolean;
}): FunctionComponent => {
	const agentId = useAuthStore((state) => state.agentId);
	const balances = useWalletBalances();

	if (!agentId) {
		return (
			<div
				className={`rounded-lg border p-6 text-center ${
					isDark
						? "border-neutral-800 bg-neutral-950"
						: "border-neutral-200 bg-neutral-50"
				}`}
			>
				<p
					className={`text-sm ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
				>
					Connect your wallet to view balances.
				</p>
			</div>
		);
	}

	const data = balances.data ?? [];

	return (
		<div className="space-y-4">
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
							Wallet Balances
						</h3>
						<p
							className={`mt-1 text-xs ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
						>
							On-chain balances for the connected Solana wallet.
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
					Loading balances...
				</p>
			)}
			{balances.isError && (
				<p className="text-xs text-red-500">
					Failed to load wallet balances: {balances.error.message}
				</p>
			)}
			{!balances.isLoading && !balances.isError && data.length === 0 && (
				<p
					className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
				>
					No balances found.
				</p>
			)}
			<div className="space-y-2">
				{data.map((balance) => (
					<BalanceRow
						key={`${balance.network}:${balance.symbol}`}
						balance={balance}
						isDark={isDark}
					/>
				))}
			</div>
		</div>
	);
};
