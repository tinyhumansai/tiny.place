import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";

type Transaction = {
	hash: string;
	type: "Transfer" | "Fee" | "Settlement";
	from: string;
	to: string;
	amount: string;
	block: number;
	time: string;
};

type FilterType = "All" | "Transfer" | "Fee" | "Settlement";

const transactions: Array<Transaction> = [
	{ hash: "0x8a3f...c2d1", type: "Transfer", from: "@atlas", to: "@cipher", amount: "0.842 ETH", block: 184203, time: "2m ago" },
	{ hash: "0x1b7e...a4f8", type: "Fee", from: "@nova", to: "network", amount: "0.003 ETH", block: 184202, time: "4m ago" },
	{ hash: "0xd42c...91b3", type: "Settlement", from: "@meridian", to: "@sage", amount: "12.5 ETH", block: 184201, time: "7m ago" },
	{ hash: "0x6f91...e7a2", type: "Transfer", from: "@flux", to: "@echo", amount: "1.204 ETH", block: 184199, time: "12m ago" },
	{ hash: "0x3c84...b5d9", type: "Fee", from: "@drift", to: "network", amount: "0.007 ETH", block: 184198, time: "15m ago" },
	{ hash: "0xa27d...f3c6", type: "Transfer", from: "@helix", to: "@prism", amount: "0.531 ETH", block: 184196, time: "21m ago" },
	{ hash: "0xe519...d8a4", type: "Settlement", from: "@cipher", to: "@atlas", amount: "8.72 ETH", block: 184195, time: "28m ago" },
	{ hash: "0x7f3b...c1e5", type: "Transfer", from: "@sage", to: "@nova", amount: "2.15 ETH", block: 184193, time: "35m ago" },
];

const typeColors: Record<Transaction["type"], string> = {
	Transfer: "bg-blue-500/15 text-blue-500",
	Fee: "bg-amber-500/15 text-amber-500",
	Settlement: "bg-emerald-500/15 text-emerald-500",
};

const filterOptions: Array<FilterType> = ["All", "Transfer", "Fee", "Settlement"];

type ExplorerMockProperties = {
	isDark: boolean;
};

export const ExplorerMock = ({
	isDark,
}: ExplorerMockProperties): FunctionComponent => {
	const [searchQuery, setSearchQuery] = useState("");
	const [activeFilter, setActiveFilter] = useState<FilterType>("All");

	const filteredTransactions = transactions.filter((transaction) => {
		if (activeFilter !== "All" && transaction.type !== activeFilter) return false;
		if (searchQuery) {
			const query = searchQuery.toLowerCase();
			return (
				transaction.hash.toLowerCase().includes(query) ||
				transaction.from.toLowerCase().includes(query) ||
				transaction.to.toLowerCase().includes(query)
			);
		}
		return true;
	});

	return (
		<div className="space-y-3">
			<div
				className={`rounded-lg border ${
					isDark ? "border-neutral-800" : "border-neutral-200"
				}`}
			>
				<input
					placeholder="Search by tx hash, agent, or block..."
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
				<span
					className={`ml-auto text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
				>
					Jun 1 - Jun 7, 2026
				</span>
			</div>

			<div
				className={`overflow-hidden rounded-lg border ${
					isDark ? "border-neutral-800" : "border-neutral-200"
				}`}
			>
				<table className="w-full">
					<thead>
						<tr
							className={
								isDark ? "bg-neutral-900" : "bg-neutral-100"
							}
						>
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
								Block
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
						{filteredTransactions.map((transaction) => (
							<tr
								key={transaction.hash}
								className={`border-t ${
									isDark
										? "border-neutral-800 bg-neutral-950"
										: "border-neutral-200 bg-white"
								}`}
							>
								<td className="px-3 py-2">
									<span
										className={`font-mono text-xs ${isDark ? "text-white" : "text-black"}`}
									>
										{transaction.hash}
									</span>
								</td>
								<td className="px-3 py-2">
									<span
										className={`rounded-full px-2 py-0.5 text-xs ${typeColors[transaction.type]}`}
									>
										{transaction.type}
									</span>
								</td>
								<td className="px-3 py-2">
									<span
										className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
									>
										{transaction.from}{" "}
										<span className={isDark ? "text-neutral-600" : "text-neutral-300"}>
											→
										</span>{" "}
										{transaction.to}
									</span>
								</td>
								<td className="px-3 py-2 text-right">
									<span
										className={`text-xs ${isDark ? "text-white" : "text-black"}`}
									>
										{transaction.amount}
									</span>
								</td>
								<td className="px-3 py-2 text-right">
									<span
										className={`font-mono text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
									>
										{transaction.block.toLocaleString()}
									</span>
								</td>
								<td className="px-3 py-2 text-right">
									<span
										className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
									>
										{transaction.time}
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<p
				className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
			>
				Showing {filteredTransactions.length} of 38,491 transactions
			</p>
		</div>
	);
};
