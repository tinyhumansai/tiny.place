"use client";

import { useState } from "react";

import type { ExplorerTransactionSummary } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { useExplorerOverview } from "@src/hooks/use-explorer";

type FilterType = string;

function truncateTransactionId(transactionId: string): string {
	if (transactionId.length <= 13) return transactionId;
	return `${transactionId.slice(0, 6)}...${transactionId.slice(-4)}`;
}

function formatTimestamp(timestamp: string): string {
	const date = new Date(timestamp);
	const now = new Date();
	const differenceMs = now.getTime() - date.getTime();
	const differenceMinutes = Math.floor(differenceMs / 60_000);

	if (differenceMinutes < 1) return "just now";
	if (differenceMinutes < 60) return `${differenceMinutes}m ago`;

	const differenceHours = Math.floor(differenceMinutes / 60);
	if (differenceHours < 24) return `${differenceHours}h ago`;

	const differenceDays = Math.floor(differenceHours / 24);
	return `${differenceDays}d ago`;
}

const typeColors: Record<string, string> = {
	REGISTRATION: "bg-purple-500/15 text-purple-500",
	RENEWAL: "bg-teal-500/15 text-teal-500",
	SALE: "bg-blue-500/15 text-blue-500",
	PAYMENT: "bg-emerald-500/15 text-emerald-500",
	SUBSCRIPTION: "bg-amber-500/15 text-amber-500",
};

const defaultTypeColor = "bg-neutral-500/15 text-neutral-500";

const filterOptions: Array<FilterType> = [
	"All",
	"REGISTRATION",
	"RENEWAL",
	"SALE",
	"PAYMENT",
	"SUBSCRIPTION",
];

type ExplorerProperties = {
	isDark: boolean;
};

export const Explorer = ({ isDark }: ExplorerProperties): FunctionComponent => {
	const [searchQuery, setSearchQuery] = useState("");
	const [activeFilter, setActiveFilter] = useState<FilterType>("All");
	const [selectedTransaction, setSelectedTransaction] = useState<string | null>(
		null
	);

	const overview = useExplorerOverview();

	if (overview.isLoading) {
		return (
			<div className="flex items-center justify-center py-12">
				<span
					className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
				>
					Loading transactions...
				</span>
			</div>
		);
	}

	if (overview.isError) {
		return (
			<div className="flex items-center justify-center py-12">
				<span className="text-xs text-red-500">
					Failed to load transactions. Please try again.
				</span>
			</div>
		);
	}

	const recentTransactions: Array<ExplorerTransactionSummary> =
		overview.data?.recentTransactions ?? [];

	const filteredTransactions = recentTransactions.filter((transaction) => {
		if (activeFilter !== "All" && transaction.type !== activeFilter)
			return false;
		if (searchQuery) {
			const query = searchQuery.toLowerCase();
			return (
				transaction.txId.toLowerCase().includes(query) ||
				(transaction.from ?? "").toLowerCase().includes(query) ||
				(transaction.to ?? "").toLowerCase().includes(query)
			);
		}
		return true;
	});

	const totalEntries = overview.data?.ledger.totalEntries ?? 0;

	return (
		<div className="space-y-3">
			<div
				className={`rounded-lg border ${
					isDark ? "border-neutral-800" : "border-neutral-200"
				}`}
			>
				<input
					placeholder="Search by tx hash, agent..."
					type="text"
					value={searchQuery}
					className={`w-full rounded-lg px-3 py-2 text-xs outline-none ${
						isDark
							? "bg-neutral-950 text-white placeholder:text-neutral-600"
							: "bg-neutral-50 text-black placeholder:text-neutral-400"
					}`}
					onChange={(event): void => {
						setSearchQuery(event.target.value);
					}}
				/>
			</div>

			<div className="flex items-center gap-2">
				{filterOptions.map((filter) => (
					<button
						key={filter}
						type="button"
						className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
							activeFilter === filter
								? isDark
									? "bg-neutral-800 text-white"
									: "bg-neutral-200 text-black"
								: isDark
									? "text-neutral-500 hover:text-neutral-300"
									: "text-neutral-400 hover:text-neutral-600"
						}`}
						onClick={(): void => {
							setActiveFilter(filter);
						}}
					>
						{filter}
					</button>
				))}
			</div>

			<div
				className={`overflow-hidden rounded-lg border ${
					isDark ? "border-neutral-800" : "border-neutral-200"
				}`}
			>
				<table className="w-full">
					<thead>
						<tr className={isDark ? "bg-neutral-900" : "bg-neutral-100"}>
							<th
								className={`px-3 py-2 text-left text-xs font-medium ${
									isDark ? "text-neutral-500" : "text-neutral-400"
								}`}
							>
								Tx Hash
							</th>
							<th
								className={`px-3 py-2 text-left text-xs font-medium ${
									isDark ? "text-neutral-500" : "text-neutral-400"
								}`}
							>
								Type
							</th>
							<th
								className={`px-3 py-2 text-left text-xs font-medium ${
									isDark ? "text-neutral-500" : "text-neutral-400"
								}`}
							>
								From / To
							</th>
							<th
								className={`px-3 py-2 text-right text-xs font-medium ${
									isDark ? "text-neutral-500" : "text-neutral-400"
								}`}
							>
								Amount
							</th>
							<th
								className={`px-3 py-2 text-right text-xs font-medium ${
									isDark ? "text-neutral-500" : "text-neutral-400"
								}`}
							>
								Status
							</th>
							<th
								className={`px-3 py-2 text-right text-xs font-medium ${
									isDark ? "text-neutral-500" : "text-neutral-400"
								}`}
							>
								Time
							</th>
						</tr>
					</thead>
					<tbody>
						{filteredTransactions.length === 0 ? (
							<tr>
								<td className="px-3 py-6 text-center" colSpan={6}>
									<span
										className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
									>
										No transactions found.
									</span>
								</td>
							</tr>
						) : (
							filteredTransactions.map((transaction) => (
								<tr
									key={transaction.txId}
									className={`cursor-pointer border-t ${
										selectedTransaction === transaction.txId
											? isDark
												? "border-neutral-800 bg-neutral-900"
												: "border-neutral-200 bg-neutral-100"
											: isDark
												? "border-neutral-800 bg-neutral-950"
												: "border-neutral-200 bg-white"
									}`}
									onClick={(): void => {
										setSelectedTransaction(
											selectedTransaction === transaction.txId
												? null
												: transaction.txId
										);
									}}
								>
									<td className="px-3 py-2">
										<span
											className={`font-mono text-xs ${isDark ? "text-white" : "text-black"}`}
										>
											{truncateTransactionId(transaction.txId)}
										</span>
									</td>
									<td className="px-3 py-2">
										<span
											className={`rounded-full px-2 py-0.5 text-xs ${typeColors[transaction.type] ?? defaultTypeColor}`}
										>
											{transaction.type}
										</span>
									</td>
									<td className="px-3 py-2">
										<span
											className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
										>
											{transaction.from ?? "System"}{" "}
											<span
												className={
													isDark ? "text-neutral-600" : "text-neutral-300"
												}
											>
												→
											</span>{" "}
											{transaction.to ?? "System"}
										</span>
									</td>
									<td className="px-3 py-2 text-right">
										<span
											className={`text-xs ${isDark ? "text-white" : "text-black"}`}
										>
											{transaction.amount ?? ""} {transaction.asset ?? ""}
										</span>
									</td>
									<td className="px-3 py-2 text-right">
										<span
											className={`text-xs ${
												transaction.status === "SETTLED"
													? "text-emerald-500"
													: transaction.status === "FAILED"
														? "text-red-500"
														: isDark
															? "text-amber-400"
															: "text-amber-500"
											}`}
										>
											{transaction.status}
										</span>
									</td>
									<td className="px-3 py-2 text-right">
										<span
											className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
										>
											{formatTimestamp(transaction.timestamp)}
										</span>
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>

			<p
				className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
			>
				Showing {filteredTransactions.length} of {totalEntries.toLocaleString()}{" "}
				transactions
			</p>
		</div>
	);
};
