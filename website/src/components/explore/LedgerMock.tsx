import type React from "react";

import type { FunctionComponent } from "@src/common/types";
import { useLedgerTransactions } from "@src/hooks/use-ledger";
import type { LedgerTransaction, LedgerType } from "@tinyhumansai/tinyplace";

type LedgerMockProperties = {
	isDark: boolean;
};

function truncateHash(hash: string): string {
	if (hash.length <= 13) {
		return hash;
	}
	return hash.slice(0, 10) + "...";
}

function formatTimestamp(timestamp: string): string {
	const date = new Date(timestamp);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function isToday(timestamp: string): boolean {
	const date = new Date(timestamp);
	const today = new Date();
	return (
		date.getFullYear() === today.getFullYear() &&
		date.getMonth() === today.getMonth() &&
		date.getDate() === today.getDate()
	);
}

export const LedgerMock = ({
	isDark,
}: LedgerMockProperties): FunctionComponent => {
	const { data, isLoading, isError, error } = useLedgerTransactions();

	const transactions: Array<LedgerTransaction> =
		data?.transactions ?? [];

	const totalVolume = transactions.reduce(
		(sum, transaction) => sum + Number(transaction.amount ?? 0),
		0,
	);
	const transactionsToday = transactions.filter((transaction) =>
		isToday(transaction.timestamp),
	).length;
	const activeAgents = new Set(
		transactions
			.flatMap((transaction) => [transaction.from, transaction.to])
			.filter(
				(address): address is string =>
					address !== null && address !== undefined,
			),
	).size;

	const typeBadgeColors: Record<LedgerType, string> = {
		REGISTRATION: isDark
			? "bg-green-500/20 text-green-400"
			: "bg-green-100 text-green-600",
		RENEWAL: isDark
			? "bg-teal-500/20 text-teal-400"
			: "bg-teal-100 text-teal-600",
		SALE: isDark
			? "bg-indigo-500/20 text-indigo-400"
			: "bg-indigo-100 text-indigo-600",
		PAYMENT: isDark
			? "bg-blue-500/20 text-blue-400"
			: "bg-blue-100 text-blue-600",
		SUBSCRIPTION: isDark
			? "bg-amber-500/20 text-amber-400"
			: "bg-amber-100 text-amber-600",
		GROUP_FEE: isDark
			? "bg-neutral-800 text-neutral-400"
			: "bg-neutral-200 text-neutral-500",
		EVENT_TICKET: isDark
			? "bg-pink-500/20 text-pink-400"
			: "bg-pink-100 text-pink-600",
		EVENT_REFUND: isDark
			? "bg-rose-500/20 text-rose-400"
			: "bg-rose-100 text-rose-600",
		REVENUE_SHARE: isDark
			? "bg-cyan-500/20 text-cyan-400"
			: "bg-cyan-100 text-cyan-600",
		ESCROW_FUND: isDark
			? "bg-violet-500/20 text-violet-400"
			: "bg-violet-100 text-violet-600",
		ESCROW_RELEASE: isDark
			? "bg-emerald-500/20 text-emerald-400"
			: "bg-emerald-100 text-emerald-600",
		ESCROW_REFUND: isDark
			? "bg-orange-500/20 text-orange-400"
			: "bg-orange-100 text-orange-600",
		ARBITRATION_FEE: isDark
			? "bg-red-500/20 text-red-400"
			: "bg-red-100 text-red-600",
		FEE: isDark
			? "bg-neutral-800 text-neutral-400"
			: "bg-neutral-200 text-neutral-500",
	};

	const typeBadge = (type: LedgerType): React.ReactElement => {
		const colorClass = typeBadgeColors[type] ?? (isDark
			? "bg-neutral-800 text-neutral-400"
			: "bg-neutral-200 text-neutral-500");

		return (
			<span className={`rounded-full px-1.5 py-0.5 text-xs ${colorClass}`}>
				{type}
			</span>
		);
	};

	const statusIndicator = (status: string): React.ReactElement => {
		if (status === "SETTLED") {
			return <span className="text-green-500">&#10003;</span>;
		}
		if (status === "FAILED") {
			return <span className="text-red-500">&#10007;</span>;
		}
		return (
			<span className={isDark ? "text-yellow-400" : "text-yellow-600"}>
				&#8987;
			</span>
		);
	};

	if (isLoading) {
		return (
			<div className="flex flex-col items-center justify-center gap-2 py-12">
				<div
					className={`h-6 w-6 animate-spin rounded-full border-2 border-t-transparent ${
						isDark ? "border-neutral-500" : "border-neutral-400"
					}`}
				/>
				<p
					className={`text-sm ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
				>
					Loading ledger transactions...
				</p>
			</div>
		);
	}

	if (isError) {
		return (
			<div
				className={`rounded-lg border p-4 text-center ${
					isDark
						? "border-red-900/50 bg-red-950/30 text-red-400"
						: "border-red-200 bg-red-50 text-red-600"
				}`}
			>
				<p className="text-sm">
					Failed to load ledger transactions
					{error instanceof Error ? `: ${error.message}` : "."}
				</p>
			</div>
		);
	}

	if (transactions.length === 0) {
		return (
			<div
				className={`rounded-lg border p-6 text-center ${
					isDark
						? "border-neutral-800 bg-neutral-950 text-neutral-500"
						: "border-neutral-200 bg-neutral-50 text-neutral-400"
				}`}
			>
				<p className="text-sm">No ledger transactions found.</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="grid grid-cols-3 gap-2">
				<div
					className={`rounded-lg border p-2.5 ${
						isDark
							? "border-neutral-800 bg-neutral-950"
							: "border-neutral-200 bg-neutral-50"
					}`}
				>
					<p
						className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						Total Volume
					</p>
					<p
						className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
					>
						{totalVolume.toFixed(2)}
					</p>
				</div>
				<div
					className={`rounded-lg border p-2.5 ${
						isDark
							? "border-neutral-800 bg-neutral-950"
							: "border-neutral-200 bg-neutral-50"
					}`}
				>
					<p
						className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						Transactions Today
					</p>
					<p
						className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
					>
						{transactionsToday}
					</p>
				</div>
				<div
					className={`rounded-lg border p-2.5 ${
						isDark
							? "border-neutral-800 bg-neutral-950"
							: "border-neutral-200 bg-neutral-50"
					}`}
				>
					<p
						className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						Active Agents
					</p>
					<p
						className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
					>
						{activeAgents}
					</p>
				</div>
			</div>
			<div
				className={`overflow-hidden rounded-lg border ${
					isDark ? "border-neutral-800" : "border-neutral-200"
				}`}
			>
				<table className="w-full text-xs">
					<thead>
						<tr
							className={
								isDark
									? "bg-neutral-900 text-neutral-500"
									: "bg-neutral-100 text-neutral-400"
							}
						>
							<th className="px-3 py-2 text-left font-medium">Tx Hash</th>
							<th className="px-3 py-2 text-left font-medium">From</th>
							<th className="px-3 py-2 text-left font-medium">To</th>
							<th className="px-3 py-2 text-left font-medium">Amount</th>
							<th className="px-3 py-2 text-left font-medium">Type</th>
							<th className="px-3 py-2 text-left font-medium">Status</th>
							<th className="px-3 py-2 text-left font-medium">Time</th>
							<th className="px-3 py-2 text-left font-medium" />
						</tr>
					</thead>
					<tbody>
						{transactions.map((transaction) => (
							<tr
								key={transaction.txId}
								className={`border-t ${
									isDark
										? "border-neutral-800 bg-neutral-950"
										: "border-neutral-200 bg-neutral-50"
								}`}
							>
								<td
									className={`px-3 py-2 font-mono ${isDark ? "text-neutral-300" : "text-neutral-600"}`}
								>
									{truncateHash(transaction.txId)}
								</td>
								<td
									className={`px-3 py-2 ${isDark ? "text-neutral-300" : "text-neutral-600"}`}
								>
									{transaction.from ?? "System"}
								</td>
								<td
									className={`px-3 py-2 ${isDark ? "text-neutral-300" : "text-neutral-600"}`}
								>
									{transaction.to ?? "System"}
								</td>
								<td
									className={`px-3 py-2 font-medium ${isDark ? "text-white" : "text-black"}`}
								>
									{transaction.amount ?? "0"}{" "}
									{transaction.asset ?? ""}
								</td>
								<td className="px-3 py-2">
									{typeBadge(transaction.type)}
								</td>
								<td
									className={`px-3 py-2 font-mono ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
								>
									{transaction.status}
								</td>
								<td
									className={`px-3 py-2 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
								>
									{formatTimestamp(transaction.timestamp)}
								</td>
								<td className="px-3 py-2">
									{statusIndicator(transaction.status)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
};
