"use client";

import { useState } from "react";

import type {
	ExplorerOverview,
	ExplorerTransactionSummary,
} from "@tinyhumansai/tinyplace";

import { formatTokenAmount } from "@src/common/format-amount";
import type { FunctionComponent } from "@src/common/types";
import { Chip } from "@src/components/ui/Chip";
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
	GROUP_FEE: "bg-neutral-500/15 text-neutral-500",
	EVENT_TICKET: "bg-pink-500/15 text-pink-500",
	EVENT_REFUND: "bg-rose-500/15 text-rose-500",
	REVENUE_SHARE: "bg-cyan-500/15 text-cyan-500",
	ESCROW_FUND: "bg-violet-500/15 text-violet-500",
	ESCROW_RELEASE: "bg-emerald-500/15 text-emerald-500",
	ESCROW_REFUND: "bg-orange-500/15 text-orange-500",
	ARBITRATION_FEE: "bg-red-500/15 text-red-500",
	FEE: "bg-neutral-500/15 text-neutral-500",
};

const defaultTypeColor = "bg-neutral-500/15 text-neutral-500";

const filterOptions: Array<FilterType> = [
	"All",
	"REGISTRATION",
	"RENEWAL",
	"SALE",
	"PAYMENT",
	"SUBSCRIPTION",
	"ESCROW_FUND",
	"ESCROW_RELEASE",
	"FEE",
];

function amountLabel(transaction: ExplorerTransactionSummary): string {
	if (!transaction.amount) {
		return "";
	}
	// amount is in base units; render "1 USDC" not "1000000 USDC".
	return formatTokenAmount(transaction.amount, transaction.asset ?? undefined);
}

function networkLabel(network: string): string {
	if (network.includes(":")) {
		const parts = network.split(":");
		return parts[parts.length - 1] ?? network;
	}
	return network;
}

function metricCards(data: ExplorerOverview | undefined): Array<{
	label: string;
	value: string;
}> {
	return [
		{
			label: "24h transactions",
			value: String(data?.last24h.transactions ?? 0),
		},
		{
			label: "24h volume",
			value: `$${data?.last24h.volumeUsd ?? "0"}`,
		},
		{
			label: "All-time volume",
			value: `$${data?.allTime.volumeUsd ?? "0"}`,
		},
		{
			label: "Fees",
			value: `$${data?.allTime.feesUsd ?? "0"}`,
		},
	];
}

type ExplorerProperties = {
	isDark: boolean;
	/**
	 * When provided, the search query is controlled by the parent and this
	 * component renders no input of its own (a shared search bar drives it).
	 */
	query?: string;
};

export const Explorer = ({
	isDark,
	query: externalQuery,
}: ExplorerProperties): FunctionComponent => {
	const [internalQuery, setInternalQuery] = useState("");
	const controlled = externalQuery !== undefined;
	const searchQuery = externalQuery ?? internalQuery;
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
			{!controlled && (
				<div
					className={`rounded-lg border ${
						isDark ? "border-neutral-800" : "border-neutral-200"
					}`}
				>
					<input
						placeholder="Search by tx hash, agent..."
						type="text"
						value={internalQuery}
						className={`w-full rounded-lg px-3 py-2 text-xs outline-none ${
							isDark
								? "bg-neutral-950 text-white placeholder:text-neutral-600"
								: "bg-neutral-50 text-black placeholder:text-neutral-400"
						}`}
						onChange={(event): void => {
							setInternalQuery(event.target.value);
						}}
					/>
				</div>
			)}

			<div className="flex items-center gap-2">
				{filterOptions.map((filter) => (
					<Chip
						key={filter}
						active={activeFilter === filter}
						isDark={isDark}
						onClick={(): void => {
							setActiveFilter(filter);
						}}
					>
						{filter}
					</Chip>
				))}
			</div>

			<div className="grid grid-cols-2 gap-2 md:grid-cols-4">
				{metricCards(overview.data).map((metric) => (
					<div
						key={metric.label}
						className={`rounded-lg border p-2.5 ${
							isDark
								? "border-neutral-800 bg-neutral-950"
								: "border-neutral-200 bg-neutral-50"
						}`}
					>
						<p
							className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
						>
							{metric.label}
						</p>
						<p
							className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
						>
							{metric.value}
						</p>
					</div>
				))}
			</div>

			<div
				className={`overflow-hidden rounded-lg border ${
					isDark ? "border-neutral-800" : "border-neutral-200"
				}`}
			>
				<table className="w-full text-xs">
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
								className={`px-3 py-2 text-left text-xs font-medium ${
									isDark ? "text-neutral-500" : "text-neutral-400"
								}`}
							>
								Amount
							</th>
							<th
								className={`px-3 py-2 text-left text-xs font-medium ${
									isDark ? "text-neutral-500" : "text-neutral-400"
								}`}
							>
								Fee
							</th>
							<th
								className={`px-3 py-2 text-left text-xs font-medium ${
									isDark ? "text-neutral-500" : "text-neutral-400"
								}`}
							>
								Network
							</th>
							<th
								className={`px-3 py-2 text-left text-xs font-medium ${
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
								<td className="px-3 py-6 text-center" colSpan={8}>
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
											{amountLabel(transaction)}
										</span>
									</td>
									<td className="px-3 py-2">
										<span
											className={`text-xs ${isDark ? "text-neutral-400" : "text-neutral-600"}`}
										>
											{transaction.fee
												? formatTokenAmount(
														transaction.fee.amount,
														transaction.asset ?? undefined
													)
												: "—"}
										</span>
									</td>
									<td className="px-3 py-2">
										<span
											className={`font-mono text-xs ${isDark ? "text-neutral-400" : "text-neutral-600"}`}
										>
											{networkLabel(transaction.network)}
										</span>
									</td>
									<td className="px-3 py-2">
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
											<span
												className={`ml-2 ${isDark ? "text-neutral-600" : "text-neutral-400"}`}
											>
												{transaction.visibility}
											</span>
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
