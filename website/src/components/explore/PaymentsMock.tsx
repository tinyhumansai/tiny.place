"use client";

import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";
import { useSupportedPayments } from "@src/hooks/use-payments";

type Transaction = {
	type: "Received" | "Sent";
	counterparty: string;
	amount: number;
	description: string;
	timestamp: string;
	status: "Completed" | "Pending";
};

const transactions: Array<Transaction> = [
	{
		type: "Received",
		counterparty: "@meridian",
		amount: 25.0,
		description: "Market analysis report delivery",
		timestamp: "2026-06-07 14:32",
		status: "Completed",
	},
	{
		type: "Sent",
		counterparty: "@cipher",
		amount: 150.0,
		description: "Smart contract audit payment",
		timestamp: "2026-06-07 12:15",
		status: "Completed",
	},
	{
		type: "Received",
		counterparty: "@nova",
		amount: 80.0,
		description: "NLP fine-tuning service fee",
		timestamp: "2026-06-06 22:41",
		status: "Completed",
	},
	{
		type: "Sent",
		counterparty: "@flux",
		amount: 35.0,
		description: "Data pipeline subscription",
		timestamp: "2026-06-06 18:03",
		status: "Pending",
	},
	{
		type: "Received",
		counterparty: "@drift",
		amount: 120.0,
		description: "Portfolio strategy consultation",
		timestamp: "2026-06-06 10:27",
		status: "Completed",
	},
	{
		type: "Sent",
		counterparty: "@sage",
		amount: 45.0,
		description: "Knowledge graph access fee",
		timestamp: "2026-06-05 16:55",
		status: "Completed",
	},
	{
		type: "Received",
		counterparty: "@echo",
		amount: 60.0,
		description: "Anomaly detection report",
		timestamp: "2026-06-05 09:12",
		status: "Completed",
	},
	{
		type: "Sent",
		counterparty: "@atlas",
		amount: 90.0,
		description: "Geospatial data license",
		timestamp: "2026-06-04 21:38",
		status: "Pending",
	},
];

const filters = ["All", "Received", "Sent"] as const;

type PaymentsMockProperties = {
	isDark: boolean;
};

export const PaymentsMock = ({
	isDark,
}: PaymentsMockProperties): FunctionComponent => {
	const [activeFilter, setActiveFilter] =
		useState<(typeof filters)[number]>("All");
	const supportedPayments = useSupportedPayments();

	const filtered =
		activeFilter === "All"
			? transactions
			: transactions.filter((transaction) => transaction.type === activeFilter);

	const totalReceived = transactions
		.filter((transaction) => transaction.type === "Received")
		.reduce((sum, transaction) => sum + transaction.amount, 0);

	const totalSent = transactions
		.filter((transaction) => transaction.type === "Sent")
		.reduce((sum, transaction) => sum + transaction.amount, 0);

	const pending = transactions
		.filter((transaction) => transaction.status === "Pending")
		.reduce((sum, transaction) => sum + transaction.amount, 0);

	return (
		<div className="flex flex-col gap-3">
			<div
				className={`rounded-lg border p-3 ${
					isDark
						? "border-neutral-800 bg-neutral-950"
						: "border-neutral-200 bg-neutral-50"
				}`}
			>
				<div className="flex items-center justify-between gap-3">
					<span
						className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
					>
						Supported payment networks
					</span>
					<span
						className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						Live from staging
					</span>
				</div>
				{supportedPayments.isLoading && (
					<p
						className={`mt-2 text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						Loading supported networks...
					</p>
				)}
				{supportedPayments.isError && (
					<p className="mt-2 text-xs text-red-500">
						Failed to load supported payment networks
					</p>
				)}
				{supportedPayments.data && (
					<div className="mt-3 grid gap-2 md:grid-cols-2">
						{supportedPayments.data.chains.map((chain) => (
							<div
								key={chain.network}
								className={`rounded-md border p-2 ${
									isDark
										? "border-neutral-800 bg-neutral-900"
										: "border-neutral-200 bg-white"
								}`}
							>
								<div className="flex items-center justify-between gap-2">
									<span
										className={`text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
									>
										{chain.name}
									</span>
									<span
										className={`rounded-full px-1.5 py-0.5 text-xs ${
											isDark
												? "bg-neutral-800 text-neutral-400"
												: "bg-neutral-100 text-neutral-500"
										}`}
									>
										{chain.kind}
									</span>
								</div>
								<p
									className={`mt-1 break-all text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
								>
									{chain.network}
								</p>
								<div className="mt-2 flex flex-wrap gap-1">
									{chain.assets.map((asset) => (
										<span
											key={`${chain.network}-${asset.symbol}`}
											className={`rounded-full px-1.5 py-0.5 text-xs ${
												isDark
													? "bg-neutral-800 text-neutral-300"
													: "bg-neutral-100 text-neutral-600"
											}`}
										>
											{asset.symbol}
										</span>
									))}
								</div>
							</div>
						))}
					</div>
				)}
			</div>
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
						Total Received
					</p>
					<p className="text-sm font-medium text-green-500">
						{totalReceived.toFixed(2)} USDC
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
						Total Sent
					</p>
					<p
						className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
					>
						{totalSent.toFixed(2)} USDC
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
						Pending
					</p>
					<p
						className={`text-sm font-medium ${isDark ? "text-amber-400" : "text-amber-500"}`}
					>
						{pending.toFixed(2)} USDC
					</p>
				</div>
			</div>
			<div className="flex gap-1">
				{filters.map((filter) => (
					<button
						key={filter}
						type="button"
						className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
							activeFilter === filter
								? isDark
									? "bg-neutral-700 text-white"
									: "bg-neutral-300 text-black"
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
				<table className="w-full text-xs">
					<thead>
						<tr
							className={
								isDark
									? "bg-neutral-900 text-neutral-500"
									: "bg-neutral-100 text-neutral-400"
							}
						>
							<th className="px-3 py-2 text-left font-medium">Type</th>
							<th className="px-3 py-2 text-left font-medium">Counterparty</th>
							<th className="px-3 py-2 text-left font-medium">Amount</th>
							<th className="px-3 py-2 text-left font-medium">Description</th>
							<th className="px-3 py-2 text-left font-medium">Time</th>
							<th className="px-3 py-2 text-left font-medium">Status</th>
						</tr>
					</thead>
					<tbody>
						{filtered.map((transaction, index) => (
							<tr
								key={index}
								className={`border-t ${
									isDark
										? "border-neutral-800 bg-neutral-950"
										: "border-neutral-200 bg-neutral-50"
								}`}
							>
								<td
									className={`px-3 py-2 ${
										transaction.type === "Received"
											? "text-green-500"
											: isDark
												? "text-neutral-300"
												: "text-neutral-600"
									}`}
								>
									{transaction.type}
								</td>
								<td
									className={`px-3 py-2 ${isDark ? "text-neutral-300" : "text-neutral-600"}`}
								>
									{transaction.counterparty}
								</td>
								<td
									className={`px-3 py-2 font-medium ${
										transaction.type === "Received"
											? "text-green-500"
											: isDark
												? "text-white"
												: "text-black"
									}`}
								>
									{transaction.type === "Received" ? "+" : "-"}
									{transaction.amount.toFixed(2)}
								</td>
								<td
									className={`px-3 py-2 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
								>
									{transaction.description}
								</td>
								<td
									className={`px-3 py-2 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
								>
									{transaction.timestamp}
								</td>
								<td className="px-3 py-2">
									<span
										className={`rounded-full px-1.5 py-0.5 text-xs ${
											transaction.status === "Completed"
												? isDark
													? "bg-green-500/20 text-green-400"
													: "bg-green-100 text-green-600"
												: isDark
													? "bg-amber-500/20 text-amber-400"
													: "bg-amber-100 text-amber-600"
										}`}
									>
										{transaction.status}
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
};
