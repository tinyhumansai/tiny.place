"use client";

import { useState } from "react";
import type { IdentityListing } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { sanitizeHandle } from "@src/components/explore/identity-management";
import { useDirectoryIdentities } from "@src/hooks/use-directory";
import { useHandleAvailability } from "@src/hooks/use-registry";

type IdentityRegistryProperties = {
	isDark: boolean;
};

function formatPrice(listing: IdentityListing): string {
	return `${listing.price.amount} ${listing.price.asset}`;
}

function formatDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}
	return date.toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

export const IdentityRegistry = ({
	isDark,
}: IdentityRegistryProperties): FunctionComponent => {
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
	const identitiesQuery = useDirectoryIdentities({ limit: 20 });
	const listings = identitiesQuery.data?.identities ?? [];

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
							setInput(sanitizeHandle(event.target.value));
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
				<div
					className={`flex items-center justify-between border-b px-3 py-2 ${
						isDark ? "border-neutral-800" : "border-neutral-200"
					}`}
				>
					<span className={`text-xs font-medium ${headingClass}`}>
						Directory identities
					</span>
					<span className={`text-xs ${secondaryClass}`}>Live from staging</span>
				</div>
				{identitiesQuery.isLoading ? (
					<p className={`px-3 py-4 text-xs ${secondaryClass}`}>
						Loading identities...
					</p>
				) : null}
				{identitiesQuery.isError ? (
					<p className="px-3 py-4 text-xs text-rose-500">
						Failed to load identities
					</p>
				) : null}
				{!identitiesQuery.isLoading &&
				!identitiesQuery.isError &&
				listings.length === 0 ? (
					<p className={`px-3 py-4 text-xs ${secondaryClass}`}>
						No directory identities are currently listed.
					</p>
				) : null}
				<table className="w-full text-left text-xs">
					<thead>
						<tr
							className={`border-b ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
						>
							<th className={`px-3 py-2 font-medium ${headerClass}`}>Handle</th>
							<th className={`px-3 py-2 font-medium ${headerClass}`}>Seller</th>
							<th className={`px-3 py-2 font-medium ${headerClass}`}>
								Updated
							</th>
							<th className={`px-3 py-2 font-medium ${headerClass}`}>Status</th>
							<th className={`px-3 py-2 text-right font-medium ${headerClass}`}>
								Price
							</th>
						</tr>
					</thead>
					<tbody>
						{listings.map((entry, index) => (
							<tr
								key={entry.listingId}
								className={`border-b last:border-b-0 ${isDark ? "border-neutral-800" : "border-neutral-200"} ${
									index % 2 === 1 ? rowEvenClass : ""
								}`}
							>
								<td className={`px-3 py-2 font-medium ${headingClass}`}>
									{entry.name}
								</td>
								<td className={`px-3 py-2 font-mono ${secondaryClass}`}>
									{entry.seller}
								</td>
								<td className={`px-3 py-2 ${secondaryClass}`}>
									{formatDate(entry.updatedAt)}
								</td>
								<td className="px-3 py-2">
									<span
										className={`rounded-full px-2 py-0.5 text-xs font-medium ${
											entry.status === "active"
												? "bg-green-500/10 text-green-500"
												: "bg-amber-500/10 text-amber-500"
										}`}
									>
										{entry.status}
									</span>
								</td>
								<td
									className={`px-3 py-2 text-right font-medium ${headingClass}`}
								>
									{formatPrice(entry)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
};
