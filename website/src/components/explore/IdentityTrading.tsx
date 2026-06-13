"use client";

import { useState } from "react";

import type {
	Identity,
	IdentityListing,
	MarketplacePrice,
} from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import {
	useBuyIdentityListing,
	useCreateIdentityListing,
	useIdentityFloor,
	useIdentityListings,
	useIdentityRecentSales,
} from "@src/hooks/use-identity-market";
import {
	firstActiveIdentity,
	useOwnedIdentities,
} from "@src/hooks/use-marketplace";
import { useSetPrimaryIdentity } from "@src/hooks/use-registry";
import { useAuthStore } from "@src/store/auth";

const avatarColors = [
	"bg-indigo-600",
	"bg-teal-600",
	"bg-orange-600",
	"bg-rose-600",
	"bg-emerald-600",
	"bg-blue-600",
	"bg-purple-600",
];

function strip(name: string): string {
	return name.replace(/^@+/, "");
}

function initialsFor(name: string): string {
	return strip(name).slice(0, 2).toUpperCase();
}

function colorFor(name: string): string {
	let hash = 0;
	for (const char of strip(name)) {
		hash = (hash + char.charCodeAt(0)) % avatarColors.length;
	}
	return avatarColors[hash] ?? "bg-indigo-600";
}

function formatPrice(price: MarketplacePrice): string {
	return `${price.amount} ${price.asset}`;
}

function floorLabel(length: number): string {
	if (length >= 5) return "5+ chars";
	return `${String(length)} char${length === 1 ? "" : "s"}`;
}

function floorDescription(length: number): string {
	if (length === 3) return "Short handles";
	if (length === 4) return "Compact handles";
	return "Long-form identities";
}

const floorLengths = [3, 4, 5] as const;

type IdentityListingFormProperties = {
	agentId: string;
	isDark: boolean;
	isIdentityLoading: boolean;
	sellerHandle: string | undefined;
};

function IdentityListingForm({
	agentId,
	isDark,
	isIdentityLoading,
	sellerHandle,
}: IdentityListingFormProperties): FunctionComponent {
	const createListing = useCreateIdentityListing();
	const [amount, setAmount] = useState("");
	const [description, setDescription] = useState("");

	const inputClass = `w-full rounded-md border px-2.5 py-1.5 text-xs ${
		isDark
			? "border-neutral-700 bg-neutral-900 text-white placeholder-neutral-600"
			: "border-neutral-300 bg-white text-black placeholder-neutral-400"
	}`;
	const labelClass = `text-xs font-medium ${isDark ? "text-neutral-400" : "text-neutral-500"}`;
	const cardClass = isDark
		? "border-neutral-800 bg-neutral-950"
		: "border-neutral-200 bg-neutral-50";

	const handleSubmit = (event: React.FormEvent): void => {
		event.preventDefault();
		if (!sellerHandle) {
			return;
		}
		createListing.mutate(
			{
				description,
				name: sellerHandle,
				price: {
					amount,
					asset: "USDC",
					network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
				},
				seller: sellerHandle,
				sellerCryptoId: agentId,
			},
			{
				onSuccess: (): void => {
					setAmount("");
					setDescription("");
				},
			}
		);
	};

	return (
		<form
			className={`rounded-lg border p-4 ${cardClass}`}
			onSubmit={handleSubmit}
		>
			<h3
				className={`mb-3 text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
			>
				List an Identity
			</h3>
			<p
				className={`mb-3 text-xs ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
			>
				{isIdentityLoading
					? "Checking registered handles..."
					: sellerHandle
						? `Selling ${sellerHandle}`
						: "Register a handle before listing identities."}
			</p>
			<div className="grid grid-cols-2 gap-3">
				<div>
					<label className={labelClass}>Price (USDC)</label>
					<input
						required
						className={inputClass}
						min="0"
						placeholder="25.00"
						step="0.01"
						type="number"
						value={amount}
						onChange={(event): void => {
							setAmount(event.target.value);
						}}
					/>
				</div>
				<div>
					<label className={labelClass}>Description</label>
					<input
						className={inputClass}
						placeholder="Premium agent handle"
						type="text"
						value={description}
						onChange={(event): void => {
							setDescription(event.target.value);
						}}
					/>
				</div>
			</div>
			{createListing.isError && (
				<p className="mt-2 text-xs text-rose-500">
					{createListing.error instanceof Error
						? createListing.error.message
						: "Failed to list identity"}
				</p>
			)}
			{createListing.isSuccess && (
				<p className="mt-2 text-xs text-emerald-500">Identity listed.</p>
			)}
			<button
				className="mt-3 w-full rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
				disabled={createListing.isPending || !sellerHandle || !amount}
				type="submit"
			>
				{createListing.isPending ? "Listing..." : "List Identity"}
			</button>
		</form>
	);
}

type FloorCardProperties = {
	isDark: boolean;
	length: number;
};

function FloorCard({ isDark, length }: FloorCardProperties): FunctionComponent {
	const floorQuery = useIdentityFloor(length);
	const secondaryClass = isDark ? "text-neutral-500" : "text-neutral-400";
	const headingClass = isDark ? "text-white" : "text-black";
	const cardClass = isDark
		? "border-neutral-800 bg-neutral-950"
		: "border-neutral-200 bg-neutral-50";
	const price = floorQuery.data?.price;

	return (
		<div className={`rounded-lg border p-3 ${cardClass}`}>
			<div className={`text-xs ${secondaryClass}`}>{floorLabel(length)}</div>
			<div className={`mt-1 text-sm font-semibold ${headingClass}`}>
				{floorQuery.isLoading
					? "Loading..."
					: price
						? formatPrice(price)
						: "No floor"}
			</div>
			<div className={`mt-1 text-xs ${secondaryClass}`}>
				{floorQuery.isError ? "Unavailable" : floorDescription(length)}
			</div>
		</div>
	);
}

type MyIdentitiesPanelProperties = {
	identities: Array<Identity>;
	isDark: boolean;
};

// Lists the connected wallet's active identities, shows which one is the
// primary handle, and lets the owner assign/unassign primary. A primary name is
// locked from sale, so this is where a seller unassigns before listing.
function MyIdentitiesPanel({
	identities,
	isDark,
}: MyIdentitiesPanelProperties): FunctionComponent {
	const setPrimary = useSetPrimaryIdentity();
	const cardClass = isDark
		? "border-neutral-800 bg-neutral-950"
		: "border-neutral-200 bg-neutral-50";
	const headingClass = isDark ? "text-white" : "text-black";
	const secondaryClass = isDark ? "text-neutral-500" : "text-neutral-400";

	if (identities.length === 0) {
		return null;
	}

	return (
		<div className={`rounded-lg border p-4 ${cardClass}`}>
			<h3 className={`mb-3 text-sm font-medium ${headingClass}`}>
				Your Identities
			</h3>
			<ul className="space-y-2">
				{identities.map((identity) => (
					<li
						key={identity.username}
						className="flex items-center justify-between gap-2"
					>
						<span className={`text-sm ${headingClass}`}>
							{identity.username}
							{identity.primary && (
								<span className="ml-2 rounded-full bg-emerald-600/20 px-2 py-0.5 text-xs font-medium text-emerald-500">
									Primary
								</span>
							)}
							{!identity.primary && (
								<span className={`ml-2 text-xs ${secondaryClass}`}>
									Unassigned · sellable
								</span>
							)}
						</span>
						<button
							className="rounded-md border border-neutral-600 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-neutral-700/30 disabled:opacity-50"
							disabled={setPrimary.isPending}
							type="button"
							onClick={(): void => {
								setPrimary.mutate({
									name: identity.username,
									primary: !identity.primary,
								});
							}}
						>
							{identity.primary ? "Unassign" : "Set primary"}
						</button>
					</li>
				))}
			</ul>
			{setPrimary.isError && (
				<p className="mt-2 text-xs text-rose-500">
					{setPrimary.error instanceof Error
						? setPrimary.error.message
						: "Failed to update primary"}
				</p>
			)}
		</div>
	);
}

type IdentityTradingProperties = {
	isDark: boolean;
};

export const IdentityTrading = ({
	isDark,
}: IdentityTradingProperties): FunctionComponent => {
	const [selectedListing, setSelectedListing] = useState<string | null>(null);
	const agentId = useAuthStore((state) => state.agentId);

	const listingsQuery = useIdentityListings();
	const salesQuery = useIdentityRecentSales();
	const ownedIdentities = useOwnedIdentities(agentId);
	const buyerIdentity = firstActiveIdentity(ownedIdentities.data?.identities);
	const buyListing = useBuyIdentityListing();
	const listings = listingsQuery.data?.listings ?? [];
	const sales = salesQuery.data?.recent ?? [];

	const cardClass = isDark
		? "border-neutral-800 bg-neutral-950"
		: "border-neutral-200 bg-neutral-50";
	const headingClass = isDark ? "text-white" : "text-black";
	const secondaryClass = isDark ? "text-neutral-500" : "text-neutral-400";
	const headerClass = isDark ? "text-neutral-500" : "text-neutral-400";
	const rowEvenClass = isDark ? "bg-neutral-900/50" : "bg-neutral-100/50";

	function canBuyListing(listing: IdentityListing): boolean {
		return Boolean(
			agentId &&
			buyerIdentity &&
			listing.status === "active" &&
			listing.seller !== buyerIdentity.username
		);
	}

	const ownedActive = (ownedIdentities.data?.identities ?? []).filter(
		(identity) => identity.status === "active"
	);
	// Only an unassigned name is sellable; never offer a primary handle to the
	// listing form (the backend rejects it anyway).
	const sellableHandle = ownedActive.find((identity) => !identity.primary)
		?.username;

	return (
		<div className="space-y-4">
			{agentId && ownedActive.length > 0 && (
				<MyIdentitiesPanel identities={ownedActive} isDark={isDark} />
			)}

			{agentId && (
				<IdentityListingForm
					agentId={agentId}
					isDark={isDark}
					isIdentityLoading={ownedIdentities.isLoading}
					sellerHandle={sellableHandle}
				/>
			)}

			<div>
				<h3
					className={`mb-2 text-xs font-semibold uppercase tracking-wider ${secondaryClass}`}
				>
					Floor Prices
				</h3>
				<div className="grid grid-cols-3 gap-2">
					{floorLengths.map((length) => (
						<FloorCard key={length} isDark={isDark} length={length} />
					))}
				</div>
			</div>

			<div>
				<h3
					className={`mb-2 text-xs font-semibold uppercase tracking-wider ${secondaryClass}`}
				>
					Listed for Sale
				</h3>
				{listingsQuery.isLoading && (
					<p className={`text-xs ${secondaryClass}`}>Loading listings…</p>
				)}
				{listingsQuery.isError && (
					<p className="text-xs text-rose-500">Failed to load listings</p>
				)}
				{!listingsQuery.isLoading &&
					!listingsQuery.isError &&
					listings.length === 0 && (
						<p className={`text-xs ${secondaryClass}`}>
							No identities listed for sale
						</p>
					)}
				<div className="grid grid-cols-2 gap-2">
					{listings.map((listing) => (
						<div
							key={listing.listingId}
							className={`rounded-lg border p-3 transition-colors ${cardClass} ${
								selectedListing === listing.listingId ? "border-blue-500" : ""
							}`}
						>
							<div className="flex items-center gap-2">
								<div
									className={`${colorFor(listing.name)} flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium text-white`}
								>
									{initialsFor(listing.name)}
								</div>
								<span className={`text-sm font-medium ${headingClass}`}>
									{listing.name}
								</span>
							</div>
							<div className="mt-2 flex items-center justify-between">
								<div>
									<div className={`text-xs font-semibold ${headingClass}`}>
										{formatPrice(listing.price)}
									</div>
									<div className={`text-xs ${secondaryClass}`}>
										by {listing.seller}
									</div>
								</div>
								<div className="flex gap-1">
									<button
										type="button"
										className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
											selectedListing === listing.listingId
												? "bg-blue-600 text-white"
												: isDark
													? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
													: "bg-neutral-200 text-neutral-600 hover:bg-neutral-300"
										}`}
										onClick={(): void => {
											setSelectedListing(
												selectedListing === listing.listingId
													? null
													: listing.listingId
											);
										}}
									>
										Details
									</button>
									<button
										className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
										disabled={!canBuyListing(listing) || buyListing.isPending}
										type="button"
										onClick={(): void => {
											if (!agentId || !buyerIdentity) {
												return;
											}
											buyListing.mutate({
												buyer: buyerIdentity.username,
												buyerCryptoId: agentId,
												listingId: listing.listingId,
											});
										}}
									>
										{buyListing.isPending ? "Buying..." : "Buy"}
									</button>
								</div>
							</div>
							{selectedListing === listing.listingId && (
								<p className={`mt-2 text-xs ${secondaryClass}`}>
									{listing.description || "Fixed-price identity listing"}
								</p>
							)}
						</div>
					))}
				</div>
				{buyListing.isError && (
					<p className="mt-2 text-xs text-rose-500">
						{buyListing.error instanceof Error
							? buyListing.error.message
							: "Failed to buy identity"}
					</p>
				)}
				{buyListing.isSuccess && (
					<p className="mt-2 text-xs text-emerald-500">
						Identity purchase recorded.
					</p>
				)}
			</div>

			<div>
				<h3
					className={`mb-2 text-xs font-semibold uppercase tracking-wider ${secondaryClass}`}
				>
					Recent Sales
				</h3>
				<div className={`overflow-hidden rounded-lg border ${cardClass}`}>
					{salesQuery.isLoading && (
						<p className={`p-3 text-xs ${secondaryClass}`}>Loading sales…</p>
					)}
					{salesQuery.isError && (
						<p className="p-3 text-xs text-rose-500">Failed to load sales</p>
					)}
					{!salesQuery.isLoading &&
						!salesQuery.isError &&
						sales.length === 0 && (
							<p className={`p-3 text-xs ${secondaryClass}`}>No recent sales</p>
						)}
					{sales.length > 0 && (
						<table className="w-full text-left text-xs">
							<thead>
								<tr
									className={`border-b ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
								>
									<th className={`px-3 py-2 font-medium ${headerClass}`}>
										Handle
									</th>
									<th className={`px-3 py-2 font-medium ${headerClass}`}>
										Price
									</th>
									<th className={`px-3 py-2 font-medium ${headerClass}`}>
										Buyer
									</th>
									<th
										className={`px-3 py-2 text-right font-medium ${headerClass}`}
									>
										Date
									</th>
								</tr>
							</thead>
							<tbody>
								{sales.map((sale, index) => (
									<tr
										key={sale.saleId}
										className={`border-b last:border-b-0 ${isDark ? "border-neutral-800" : "border-neutral-200"} ${
											index % 2 === 1 ? rowEvenClass : ""
										}`}
									>
										<td className={`px-3 py-2 font-medium ${headingClass}`}>
											{sale.name}
										</td>
										<td className={`px-3 py-2 ${headingClass}`}>
											{formatPrice(sale.price)}
										</td>
										<td className={`px-3 py-2 ${secondaryClass}`}>
											{sale.buyer}
										</td>
										<td className={`px-3 py-2 text-right ${secondaryClass}`}>
											{sale.createdAt.slice(0, 10)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</div>
			</div>
		</div>
	);
};
