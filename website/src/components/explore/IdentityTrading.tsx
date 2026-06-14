"use client";

import type { MarketplacePrice } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import {
	useIdentityFloor,
	useIdentityListings,
	useIdentityRecentSales,
} from "@src/hooks/use-identity-market";
import {
	firstActiveIdentity,
	useOwnedIdentities,
} from "@src/hooks/use-marketplace";
import { useAuthStore } from "@src/store/auth";

import { IdentityListingCard } from "./IdentityListingCard";
import { IdentityManager } from "./IdentityManager";

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

type IdentityTradingProperties = {
	isDark: boolean;
};

export const IdentityTrading = ({
	isDark,
}: IdentityTradingProperties): FunctionComponent => {
	const agentId = useAuthStore((state) => state.agentId);

	const listingsQuery = useIdentityListings();
	const salesQuery = useIdentityRecentSales();
	const ownedIdentities = useOwnedIdentities(agentId);
	const buyerIdentity = firstActiveIdentity(ownedIdentities.data?.identities);
	const listings = listingsQuery.data?.listings ?? [];
	const sales = salesQuery.data?.recent ?? [];

	const cardClass = isDark
		? "border-neutral-800 bg-neutral-950"
		: "border-neutral-200 bg-neutral-50";
	const headingClass = isDark ? "text-white" : "text-black";
	const secondaryClass = isDark ? "text-neutral-500" : "text-neutral-400";
	const headerClass = isDark ? "text-neutral-500" : "text-neutral-400";
	const rowEvenClass = isDark ? "bg-neutral-900/50" : "bg-neutral-100/50";

	// Owner-controllable names: active or in the grace/expiring window (an
	// auctioned/released name is no longer the owner's to manage).
	const ownedManageable = (ownedIdentities.data?.identities ?? []).filter(
		(identity) => identity.status === "active" || identity.status === "expiring"
	);

	return (
		<div className="space-y-4">
			{agentId && ownedManageable.length > 0 && (
				<IdentityManager
					agentId={agentId}
					identities={ownedManageable}
					isDark={isDark}
					listings={listings}
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
						<IdentityListingCard
							key={listing.listingId}
							agentId={agentId}
							buyerIdentity={buyerIdentity}
							isDark={isDark}
							listing={listing}
						/>
					))}
				</div>
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
