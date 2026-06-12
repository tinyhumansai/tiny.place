"use client";

import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";
import { useHandleAvailability } from "@src/hooks/use-registry";

type RegistryEntry = {
	handle: string;
	cryptoId: string;
	createdDate: string;
	status: "Active" | "Transferring" | "Reserved";
	valueEstimate: string;
};

const registryEntries: Array<RegistryEntry> = [
	{
		handle: "@atlas",
		cryptoId: "0x7a3f…e91c",
		createdDate: "2025-01-12",
		status: "Active",
		valueEstimate: "$2,400",
	},
	{
		handle: "@cipher",
		cryptoId: "0x4b2d…f03a",
		createdDate: "2025-02-03",
		status: "Active",
		valueEstimate: "$3,100",
	},
	{
		handle: "@nova",
		cryptoId: "0x91cf…a8b2",
		createdDate: "2025-03-18",
		status: "Transferring",
		valueEstimate: "$1,800",
	},
	{
		handle: "@meridian",
		cryptoId: "0x5e8a…c47d",
		createdDate: "2025-04-01",
		status: "Active",
		valueEstimate: "$2,900",
	},
	{
		handle: "@echo",
		cryptoId: "0xd12e…6f5b",
		createdDate: "2025-04-22",
		status: "Reserved",
		valueEstimate: "$950",
	},
	{
		handle: "@flux",
		cryptoId: "0x3c7b…d2e8",
		createdDate: "2025-05-10",
		status: "Active",
		valueEstimate: "$1,600",
	},
	{
		handle: "@drift",
		cryptoId: "0xa9f4…1b3c",
		createdDate: "2025-06-01",
		status: "Active",
		valueEstimate: "$1,200",
	},
	{
		handle: "@sage",
		cryptoId: "0x6d0e…8a4f",
		createdDate: "2025-06-15",
		status: "Reserved",
		valueEstimate: "$4,500",
	},
];

const statusStyles: Record<RegistryEntry["status"], string> = {
	Active: "bg-green-500/10 text-green-500",
	Transferring: "bg-amber-500/10 text-amber-500",
	Reserved: "bg-blue-500/10 text-blue-500",
};

type IdentityRegistryMockProperties = {
	isDark: boolean;
};

export const IdentityRegistryMock = ({
	isDark,
}: IdentityRegistryMockProperties): FunctionComponent => {
	const cardClass = isDark
		? "border-neutral-800 bg-neutral-950"
		: "border-neutral-200 bg-neutral-50";
	const headerClass = isDark ? "text-neutral-500" : "text-neutral-400";
	const headingClass = isDark ? "text-white" : "text-black";
	const secondaryClass = isDark ? "text-neutral-500" : "text-neutral-400";
	const rowEvenClass = isDark ? "bg-neutral-900/50" : "bg-neutral-100/50";

	const [input, setInput] = useState<string>("");
	const [checked, setChecked] = useState<string>("");
	const { data, isFetching, isError, refetch } = useHandleAvailability(checked);

	return (
		<div className="space-y-3">
			<form
				className={`rounded-lg border p-3 ${cardClass}`}
				onSubmit={(event): void => {
					event.preventDefault();
					const next = input.trim();
					if (next === checked) {
						// Same handle as last check — re-run instead of no-op'ing.
						void refetch();
					} else {
						setChecked(next);
					}
				}}
			>
				<label
					className={`text-xs font-medium ${headingClass}`}
					htmlFor="handle-availability-input"
				>
					Check handle availability
				</label>
				<div className="mt-2 flex gap-2">
					<input
						id="handle-availability-input"
						placeholder="@yourhandle"
						value={input}
						className={`flex-1 rounded-md border px-2 py-1 text-xs ${
							isDark
								? "border-neutral-800 bg-neutral-900 text-white placeholder:text-neutral-600"
								: "border-neutral-200 bg-white text-black placeholder:text-neutral-400"
						}`}
						onChange={(event): void => {
							setInput(event.target.value);
						}}
					/>
					<button
						disabled={!input.trim()}
						type="submit"
						className={`rounded-md px-3 py-1 text-xs font-medium ${
							isDark ? "bg-white text-black" : "bg-black text-white"
						} ${input.trim() ? "" : "opacity-50"}`}
					>
						Check
					</button>
				</div>
				{checked && isFetching && (
					<p className={`mt-2 text-xs ${secondaryClass}`}>Checking…</p>
				)}
				{checked && isError && (
					<p className="mt-2 text-xs text-rose-500">Failed to check handle</p>
				)}
				{checked && !isFetching && !isError && data ? (
					<p
						className={`mt-2 text-xs font-medium ${
							data.available ? "text-green-500" : "text-rose-500"
						}`}
					>
						{data.name} is {data.available ? "available" : "taken"}
					</p>
				) : null}
			</form>

			<div className={`overflow-hidden rounded-lg border ${cardClass}`}>
				<table className="w-full text-left text-xs">
					<thead>
						<tr
							className={`border-b ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
						>
							<th className={`px-3 py-2 font-medium ${headerClass}`}>Handle</th>
							<th className={`px-3 py-2 font-medium ${headerClass}`}>
								Crypto ID
							</th>
							<th className={`px-3 py-2 font-medium ${headerClass}`}>
								Created
							</th>
							<th className={`px-3 py-2 font-medium ${headerClass}`}>Status</th>
							<th className={`px-3 py-2 text-right font-medium ${headerClass}`}>
								Value
							</th>
						</tr>
					</thead>
					<tbody>
						{registryEntries.map((entry, index) => (
							<tr
								key={entry.handle}
								className={`border-b last:border-b-0 ${isDark ? "border-neutral-800" : "border-neutral-200"} ${
									index % 2 === 1 ? rowEvenClass : ""
								}`}
							>
								<td className={`px-3 py-2 font-medium ${headingClass}`}>
									{entry.handle}
								</td>
								<td className={`px-3 py-2 font-mono ${secondaryClass}`}>
									{entry.cryptoId}
								</td>
								<td className={`px-3 py-2 ${secondaryClass}`}>
									{entry.createdDate}
								</td>
								<td className="px-3 py-2">
									<span
										className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[entry.status]}`}
									>
										{entry.status}
									</span>
								</td>
								<td
									className={`px-3 py-2 text-right font-medium ${headingClass}`}
								>
									{entry.valueEstimate}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
};
