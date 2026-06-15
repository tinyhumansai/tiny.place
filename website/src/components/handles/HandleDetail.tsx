"use client";

import Link from "next/link";
import { useState, type ReactElement } from "react";

import type {
	IdentityListing,
	MarketplacePrice,
} from "@tinyhumansai/tinyplace";
import { ProfileEntityLink } from "@src/components/profile/EntityLink";
import {
	useBuyIdentityListing,
	useCreateIdentityOffer,
	useIdentityBids,
	useIdentityListingForName,
	useIdentityOffers,
	useIdentitySaleHistory,
	usePlaceIdentityBid,
} from "@src/hooks/use-identity-market";
import {
	firstActiveIdentity,
	useOwnedIdentities,
} from "@src/hooks/use-marketplace";
import { useHandleAvailability } from "@src/hooks/use-registry";
import { useAppStore } from "@src/store/app";
import { useAuthStore } from "@src/store/auth";

import { SOLANA_NETWORK } from "../explore/marketplace/shared";

function normalizeHandle(value: string): string {
	const stripped = value.trim().replace(/^@+/, "");
	return stripped ? `@${stripped}` : "";
}

function formatPrice(price: MarketplacePrice | undefined): string {
	return price ? `${price.amount} ${price.asset}` : "—";
}

function formatDate(value: string | undefined): string {
	if (!value) {
		return "—";
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function panelClass(isDark: boolean): string {
	return `rounded-lg border p-4 ${
		isDark
			? "border-neutral-800 bg-neutral-950"
			: "border-neutral-200 bg-neutral-50"
	}`;
}

function inputClass(isDark: boolean): string {
	return `w-full rounded-md border px-2.5 py-1.5 text-xs ${
		isDark
			? "border-neutral-700 bg-neutral-900 text-white placeholder-neutral-600"
			: "border-neutral-300 bg-white text-black placeholder-neutral-400"
	}`;
}

function buttonClass(isDark: boolean): string {
	return `rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
		isDark
			? "border-neutral-700 text-neutral-200 hover:bg-neutral-900"
			: "border-neutral-300 text-neutral-700 hover:bg-neutral-100"
	}`;
}

function primaryButtonClass(): string {
	return "rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50";
}

function statusClass(isDark: boolean): string {
	return isDark
		? "bg-neutral-900 text-neutral-300"
		: "bg-neutral-100 text-neutral-600";
}

function ListingPanel({
	buyer,
	buyerCryptoId,
	handle,
	isDark,
	isOwnHandle,
	listing,
}: {
	buyer: string | undefined;
	buyerCryptoId: string | undefined;
	handle: string;
	isDark: boolean;
	isOwnHandle: boolean;
	listing: IdentityListing | undefined;
}): ReactElement {
	const [bidAmount, setBidAmount] = useState("");
	const buyListing = useBuyIdentityListing();
	const placeBid = usePlaceIdentityBid();
	const bids = useIdentityBids(listing?.listingId ?? "");
	const headingClass = isDark ? "text-white" : "text-black";
	const mutedClass = isDark ? "text-neutral-500" : "text-neutral-500";

	if (!listing) {
		return (
			<section className={panelClass(isDark)}>
				<div className="flex items-center justify-between gap-3">
					<div>
						<h2 className={`text-sm font-medium ${headingClass}`}>Listing</h2>
						<p className={`mt-1 text-xs ${mutedClass}`}>
							This handle is not currently listed for sale.
						</p>
					</div>
					<Link className={buttonClass(isDark)} href="/identities">
						Browse handles
					</Link>
				</div>
			</section>
		);
	}

	const isAuction = listing.listingType === "auction";
	const canBuy = Boolean(!isAuction && buyer && buyerCryptoId && !isOwnHandle);
	const canBid = Boolean(isAuction && buyer && buyerCryptoId && !isOwnHandle);

	return (
		<section className={panelClass(isDark)}>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className={`text-sm font-medium ${headingClass}`}>Listing</h2>
					<p className={`mt-1 text-xs ${mutedClass}`}>
						{listing.listingType} · {listing.status} · seller{" "}
						<ProfileEntityLink
							className="hover:underline"
							value={listing.seller}
						>
							{listing.seller}
						</ProfileEntityLink>
					</p>
				</div>
				<div className="text-right">
					<p className={`text-sm font-semibold ${headingClass}`}>
						{formatPrice(listing.highestBid?.price ?? listing.price)}
					</p>
					<p className={`mt-1 text-xs ${mutedClass}`}>
						{isAuction && listing.highestBid ? "highest bid" : "price"}
					</p>
				</div>
			</div>

			{listing.description && (
				<p
					className={`mt-3 text-sm ${isDark ? "text-neutral-300" : "text-neutral-700"}`}
				>
					{listing.description}
				</p>
			)}

			<div className="mt-4 flex flex-wrap gap-2">
				{!isAuction && (
					<button
						className={primaryButtonClass()}
						disabled={!canBuy || buyListing.isPending}
						type="button"
						onClick={(): void => {
							if (!buyer || !buyerCryptoId) {
								return;
							}
							buyListing.mutate({
								buyer,
								buyerCryptoId,
								listingId: listing.listingId,
							});
						}}
					>
						{buyListing.isPending ? "Buying..." : `Buy ${handle}`}
					</button>
				)}
				{isAuction && (
					<div className="flex min-w-64 flex-1 gap-2">
						<input
							className={inputClass(isDark)}
							placeholder={`Bid amount (${listing.price.asset})`}
							value={bidAmount}
							onChange={(event): void => {
								setBidAmount(event.target.value);
							}}
						/>
						<button
							className={primaryButtonClass()}
							disabled={!canBid || placeBid.isPending || !bidAmount.trim()}
							type="button"
							onClick={(): void => {
								if (!buyer || !buyerCryptoId || !bidAmount.trim()) {
									return;
								}
								placeBid.mutate({
									listingId: listing.listingId,
									bid: {
										bidder: buyer,
										bidderCryptoId: buyerCryptoId,
										price: {
											...listing.price,
											amount: bidAmount.trim(),
										},
									},
								});
							}}
						>
							{placeBid.isPending ? "Bidding..." : "Bid"}
						</button>
					</div>
				)}
			</div>

			{(buyListing.isError || placeBid.isError) && (
				<p className="mt-3 text-xs text-red-500">
					{buyListing.error?.message ?? placeBid.error?.message}
				</p>
			)}

			{isAuction && (
				<div
					className={`mt-4 border-t pt-3 ${
						isDark ? "border-neutral-800" : "border-neutral-200"
					}`}
				>
					<p className={`mb-2 text-xs font-medium ${mutedClass}`}>Bids</p>
					{bids.isLoading ? (
						<p className={`text-xs ${mutedClass}`}>Loading bids...</p>
					) : (bids.data?.bids ?? []).length === 0 ? (
						<p className={`text-xs ${mutedClass}`}>No bids yet.</p>
					) : (
						<ul className="space-y-2">
							{(bids.data?.bids ?? []).map((bid) => (
								<li
									key={bid.bidId}
									className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs ${
										isDark ? "border-neutral-800" : "border-neutral-200"
									}`}
								>
									<ProfileEntityLink
										className={`font-medium hover:underline ${headingClass}`}
										value={bid.bidder}
									>
										{bid.bidder}
									</ProfileEntityLink>
									<span className={headingClass}>{formatPrice(bid.price)}</span>
								</li>
							))}
						</ul>
					)}
				</div>
			)}
		</section>
	);
}

export function HandleDetail({ handle }: { handle: string }): ReactElement {
	const isDark = useAppStore((state) => state.theme === "dark");
	const agentId = useAuthStore((state) => state.agentId);
	const normalized = normalizeHandle(handle);
	const availability = useHandleAvailability(normalized);
	const listing = useIdentityListingForName(normalized);
	const history = useIdentitySaleHistory(normalized);
	const offers = useIdentityOffers({ name: normalized });
	const owned = useOwnedIdentities(agentId);
	const buyerIdentity = firstActiveIdentity(owned.data?.identities);
	const createOffer = useCreateIdentityOffer();
	const [offerAmount, setOfferAmount] = useState("");

	const identity = availability.data?.identity;
	const owner = identity?.cryptoId;
	const isAvailable = availability.data?.available === true;
	const isOwnHandle = Boolean(owner && agentId && owner === agentId);
	const headingClass = isDark ? "text-white" : "text-black";
	const mutedClass = isDark ? "text-neutral-500" : "text-neutral-500";
	const bodyClass = isDark ? "text-neutral-300" : "text-neutral-700";

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
			<section className={panelClass(isDark)}>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<h1
								className={`truncate text-base font-semibold ${headingClass}`}
							>
								{normalized}
							</h1>
							<span
								className={`rounded-md px-2 py-1 text-xs ${statusClass(isDark)}`}
							>
								{isAvailable ? "available" : (identity?.status ?? "unknown")}
							</span>
							{identity?.primary && (
								<span className="rounded-md bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-500">
									primary
								</span>
							)}
						</div>
						<p className={`mt-2 text-sm ${bodyClass}`}>
							Handle ownership, active market listing, offers, and sale history.
						</p>
					</div>
					<Link className={buttonClass(isDark)} href="/identities">
						Find handles
					</Link>
				</div>

				<div className="mt-4 grid gap-3 sm:grid-cols-3">
					<div>
						<p className={`text-xs ${mutedClass}`}>Owner</p>
						<p className={`mt-1 truncate text-sm font-medium ${headingClass}`}>
							{owner ? (
								<ProfileEntityLink className="hover:underline" value={owner}>
									{owner}
								</ProfileEntityLink>
							) : (
								"Unowned"
							)}
						</p>
					</div>
					<div>
						<p className={`text-xs ${mutedClass}`}>Registered</p>
						<p className={`mt-1 text-sm ${headingClass}`}>
							{formatDate(identity?.registeredAt)}
						</p>
					</div>
					<div>
						<p className={`text-xs ${mutedClass}`}>Expires</p>
						<p className={`mt-1 text-sm ${headingClass}`}>
							{formatDate(identity?.expiresAt)}
						</p>
					</div>
				</div>
			</section>

			<ListingPanel
				buyer={buyerIdentity?.username}
				buyerCryptoId={agentId ?? undefined}
				handle={normalized}
				isDark={isDark}
				isOwnHandle={isOwnHandle}
				listing={listing.data}
			/>

			<section className={panelClass(isDark)}>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 className={`text-sm font-medium ${headingClass}`}>
							Make an offer
						</h2>
						<p className={`mt-1 text-xs ${mutedClass}`}>
							Send an offer to the current owner. You need an active handle to
							offer as a buyer.
						</p>
					</div>
					{buyerIdentity && (
						<span
							className={`rounded-md px-2 py-1 text-xs font-medium ${statusClass(isDark)}`}
						>
							{buyerIdentity.username}
						</span>
					)}
				</div>
				<div className="mt-3 flex gap-2">
					<input
						className={inputClass(isDark)}
						placeholder="Offer amount (USDC)"
						value={offerAmount}
						onChange={(event): void => {
							setOfferAmount(event.target.value);
						}}
					/>
					<button
						className={primaryButtonClass()}
						type="button"
						disabled={
							!buyerIdentity ||
							!agentId ||
							isOwnHandle ||
							createOffer.isPending ||
							!offerAmount.trim()
						}
						onClick={(): void => {
							if (!buyerIdentity || !agentId || !offerAmount.trim()) {
								return;
							}
							createOffer.mutate({
								buyer: buyerIdentity.username,
								buyerCryptoId: agentId,
								name: normalized,
								price: {
									amount: offerAmount.trim(),
									asset: "USDC",
									network: SOLANA_NETWORK,
								},
								status: "pending",
							});
						}}
					>
						{createOffer.isPending ? "Offering..." : "Offer"}
					</button>
				</div>
				{createOffer.isError && (
					<p className="mt-3 text-xs text-red-500">
						{createOffer.error.message}
					</p>
				)}
			</section>

			<section className={panelClass(isDark)}>
				<h2 className={`text-sm font-medium ${headingClass}`}>Open offers</h2>
				{offers.isLoading ? (
					<p className={`mt-3 text-xs ${mutedClass}`}>Loading offers...</p>
				) : (offers.data?.offers ?? []).length === 0 ? (
					<p className={`mt-3 text-xs ${mutedClass}`}>No open offers.</p>
				) : (
					<ul className="mt-3 space-y-2">
						{(offers.data?.offers ?? []).map((offer) => (
							<li
								key={offer.offerId}
								className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs ${
									isDark ? "border-neutral-800" : "border-neutral-200"
								}`}
							>
								<ProfileEntityLink
									className={`font-medium hover:underline ${headingClass}`}
									value={offer.buyer}
								>
									{offer.buyer}
								</ProfileEntityLink>
								<span className={headingClass}>{formatPrice(offer.price)}</span>
							</li>
						))}
					</ul>
				)}
			</section>

			<section className={panelClass(isDark)}>
				<h2 className={`text-sm font-medium ${headingClass}`}>
					Trading history
				</h2>
				{history.isLoading ? (
					<p className={`mt-3 text-xs ${mutedClass}`}>Loading history...</p>
				) : (history.data?.history ?? []).length === 0 ? (
					<p className={`mt-3 text-xs ${mutedClass}`}>
						No completed sales yet.
					</p>
				) : (
					<div
						className={`mt-3 overflow-hidden rounded-lg border ${
							isDark ? "border-neutral-800" : "border-neutral-200"
						}`}
					>
						<table className="w-full text-xs">
							<thead className={isDark ? "bg-neutral-900" : "bg-neutral-100"}>
								<tr>
									<th
										className={`px-3 py-2 text-left font-medium ${mutedClass}`}
									>
										Price
									</th>
									<th
										className={`px-3 py-2 text-left font-medium ${mutedClass}`}
									>
										Buyer
									</th>
									<th
										className={`px-3 py-2 text-right font-medium ${mutedClass}`}
									>
										Date
									</th>
								</tr>
							</thead>
							<tbody>
								{(history.data?.history ?? []).map((sale) => (
									<tr
										key={sale.saleId}
										className={`border-t ${
											isDark ? "border-neutral-800" : "border-neutral-200"
										}`}
									>
										<td className={`px-3 py-2 ${headingClass}`}>
											{formatPrice(sale.price)}
										</td>
										<td className={`px-3 py-2 ${headingClass}`}>
											<ProfileEntityLink
												className="hover:underline"
												value={sale.buyer}
											>
												{sale.buyer}
											</ProfileEntityLink>
										</td>
										<td className={`px-3 py-2 text-right ${mutedClass}`}>
											{formatDate(sale.createdAt)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>
		</div>
	);
}
