import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";

type Token = "USDC" | "ETH" | "SOL";

type RecentSwap = {
	pair: string;
	amount: string;
	rate: string;
	status: "Completed" | "Pending";
	timestamp: string;
};

const tokens: Array<Token> = ["USDC", "ETH", "SOL"];

const exchangeRates: Record<string, number> = {
	"USDC-ETH": 0.00029,
	"USDC-SOL": 0.0067,
	"ETH-USDC": 3450.0,
	"ETH-SOL": 23.1,
	"SOL-USDC": 149.5,
	"SOL-ETH": 0.0433,
};

const recentSwaps: Array<RecentSwap> = [
	{
		pair: "USDC → ETH",
		amount: "500 USDC",
		rate: "0.00029",
		status: "Completed",
		timestamp: "2026-06-07 14:32",
	},
	{
		pair: "ETH → SOL",
		amount: "0.5 ETH",
		rate: "23.10",
		status: "Completed",
		timestamp: "2026-06-07 12:15",
	},
	{
		pair: "SOL → USDC",
		amount: "10 SOL",
		rate: "149.50",
		status: "Pending",
		timestamp: "2026-06-06 22:41",
	},
	{
		pair: "USDC → SOL",
		amount: "1000 USDC",
		rate: "0.0067",
		status: "Completed",
		timestamp: "2026-06-06 18:03",
	},
];

type BridgeMockProperties = {
	isDark: boolean;
};

export const BridgeMock = ({
	isDark,
}: BridgeMockProperties): FunctionComponent => {
	const [fromToken, setFromToken] = useState<Token>("USDC");
	const [toToken, setToToken] = useState<Token>("ETH");
	const [amount, setAmount] = useState<string>("100");

	const rateKey = `${fromToken}-${toToken}`;
	const rate = exchangeRates[rateKey] ?? 1;
	const computedAmount = Number.parseFloat(amount || "0") * rate;

	return (
		<div className="flex flex-col gap-3">
			<div
				className={`rounded-lg border p-4 ${
					isDark
						? "border-neutral-800 bg-neutral-950"
						: "border-neutral-200 bg-neutral-50"
				}`}
			>
				<div className="flex flex-col gap-3">
					<div>
						<p
							className={`mb-1 text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
						>
							From
						</p>
						<div className="flex gap-2">
							<select
								value={fromToken}
								className={`rounded-md border px-2 py-1.5 text-xs ${
									isDark
										? "border-neutral-700 bg-neutral-900 text-white"
										: "border-neutral-300 bg-white text-black"
								}`}
								onChange={(event): void => {
									setFromToken(event.target.value as Token);
								}}
							>
								{tokens.map((token) => (
									<option key={token} value={token}>
										{token}
									</option>
								))}
							</select>
							<input
								type="number"
								value={amount}
								className={`w-full rounded-md border px-2 py-1.5 text-xs ${
									isDark
										? "border-neutral-700 bg-neutral-900 text-white"
										: "border-neutral-300 bg-white text-black"
								}`}
								onChange={(event): void => {
									setAmount(event.target.value);
								}}
							/>
						</div>
					</div>
					<div className="flex justify-center">
						<button
							type="button"
							className={`rounded-full p-1 ${
								isDark
									? "text-neutral-500 hover:text-neutral-300"
									: "text-neutral-400 hover:text-neutral-600"
							}`}
							onClick={(): void => {
								setFromToken(toToken);
								setToToken(fromToken);
							}}
						>
							<svg
								className="h-4 w-4"
								fill="none"
								stroke="currentColor"
								strokeWidth={2}
								viewBox="0 0 24 24"
							>
								<path
									d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						</button>
					</div>
					<div>
						<p
							className={`mb-1 text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
						>
							To
						</p>
						<div className="flex gap-2">
							<select
								value={toToken}
								className={`rounded-md border px-2 py-1.5 text-xs ${
									isDark
										? "border-neutral-700 bg-neutral-900 text-white"
										: "border-neutral-300 bg-white text-black"
								}`}
								onChange={(event): void => {
									setToToken(event.target.value as Token);
								}}
							>
								{tokens.map((token) => (
									<option key={token} value={token}>
										{token}
									</option>
								))}
							</select>
							<input
								readOnly
								type="text"
								value={computedAmount.toFixed(toToken === "USDC" ? 2 : 6)}
								className={`w-full rounded-md border px-2 py-1.5 text-xs ${
									isDark
										? "border-neutral-700 bg-neutral-900 text-white"
										: "border-neutral-300 bg-white text-black"
								}`}
							/>
						</div>
					</div>
					<div className="flex items-center justify-between">
						<span
							className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
						>
							1 {fromToken} = {rate} {toToken}
						</span>
						<button
							className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500"
							type="button"
							onClick={(): void => {}}
						>
							Bridge
						</button>
					</div>
				</div>
			</div>
			<div>
				<p
					className={`mb-2 text-xs font-medium ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
				>
					Recent Swaps
				</p>
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
								<th className="px-3 py-2 text-left font-medium">Pair</th>
								<th className="px-3 py-2 text-left font-medium">Amount</th>
								<th className="px-3 py-2 text-left font-medium">Rate</th>
								<th className="px-3 py-2 text-left font-medium">Status</th>
								<th className="px-3 py-2 text-left font-medium">Time</th>
							</tr>
						</thead>
						<tbody>
							{recentSwaps.map((swap, index) => (
								<tr
									key={index}
									className={`border-t ${
										isDark
											? "border-neutral-800 bg-neutral-950"
											: "border-neutral-200 bg-neutral-50"
									}`}
								>
									<td
										className={`px-3 py-2 ${isDark ? "text-neutral-300" : "text-neutral-600"}`}
									>
										{swap.pair}
									</td>
									<td
										className={`px-3 py-2 ${isDark ? "text-white" : "text-black"}`}
									>
										{swap.amount}
									</td>
									<td
										className={`px-3 py-2 font-mono ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
									>
										{swap.rate}
									</td>
									<td className="px-3 py-2">
										<span
											className={`rounded-full px-1.5 py-0.5 text-xs ${
												swap.status === "Completed"
													? isDark
														? "bg-green-500/20 text-green-400"
														: "bg-green-100 text-green-600"
													: isDark
														? "bg-amber-500/20 text-amber-400"
														: "bg-amber-100 text-amber-600"
											}`}
										>
											{swap.status}
										</span>
									</td>
									<td
										className={`px-3 py-2 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
									>
										{swap.timestamp}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
};
