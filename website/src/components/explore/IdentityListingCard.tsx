"use client";

import { useState } from "react";

import {
	compareAmount,
	minimumIdentityBid,
	type Identity,
	type IdentityListing,
	type MarketplacePrice,
} from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import {
	useBuyIdentityListing,
	useCloseIdentityAuction,
	useCreateIdentityOffer,
	usePlaceIdentityBid,
} from "@src/hooks/use-identity-market";

import {
	accentButtonClass,
	ghostButtonClass,
	isExpired,
	strip,
} from "./identity-management";
import { useX402Confirm } from "./x402-confirm";

const avatarColors = [
	"bg-indigo-600",
	"bg-teal-600",
	"bg-orange-600",
	"bg-rose-600",
	"bg-emerald-600",
	"bg-blue-600",
	"bg-purple-600",
];

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

const SOLANA_NETWORK = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

type Panel = "none" | "details" | "bid" | "offer";

type IdentityListingCardProperties = {
	agentId: string | undefined;
	buyerIdentity: Identity | undefined;
	isDark: boolean;
	listing: IdentityListing;
};

// A single marketplace listing with all buyer/seller actions: buy (fixed),
// place a bid + close (auction), and make an off-listing offer. Per-card state
// (bid/offer amounts, expanded panel) lives here so cards don't share it.
export function IdentityListingCard({
	agentId,
	buyerIdentity,
	isDark,
	listing,
}: IdentityListingCardProperties): FunctionComponent {
	const [panel, setPanel] = useState<Panel>("none");
	const [bidAmount, setBidAmount] = useState("");
	const [offerAmount, setOfferAmount] = useState("");

	const confirmX402 = useX402Confirm();
	const buyListing = useBuyIdentityListing();
	const placeBid = usePlaceIdentityBid();
	const closeAuction = useCloseIdentityAuction();
	const createOffer = useCreateIdentityOffer();

	const cardClass = isDark
		? "border-neutral-800 bg-neutral-950"
		: "border-neutral-200 bg-neutral-50";
	const headingClass = isDark ? "text-white" : "text-black";
	const secondaryClass = isDark ? "text-neutral-500" : "text-neutral-400";
	const inputClass = `w-full rounded-md border px-2.5 py-1.5 text-xs ${
		isDark
			? "border-neutral-700 bg-neutral-900 text-white placeholder-neutral-600"
			: "border-neutral-300 bg-white text-black placeholder-neutral-400"
	}`;
	const ghost = `${ghostButtonClass(isDark)} px-3 py-1`;

	const isAuction = listing.listingType === "auction";
	const isOwnListing = Boolean(
		agentId &&
		(listing.sellerCryptoId === agentId ||
			listing.seller === buyerIdentity?.username)
	);
	const canActAsBuyer = Boolean(
		agentId && buyerIdentity && listing.status === "active" && !isOwnListing
	);
	const expired = isExpired(listing.expiresAt);
	const highest = listing.highestBid?.price;
	// Minimum acceptable next bid (base units), matching the backend's rule, so
	// we can label the field and block sub-minimum submissions client-side.
	const minBid = isAuction ? minimumIdentityBid(listing) : "0";
	// Amounts are integer base units; reject blanks/decimals before BigInt math.
	const bidBelowMinimum =
		!/^\d+$/.test(bidAmount.trim()) ||
		compareAmount(bidAmount.trim(), minBid) < 0;

	function togglePanel(next: Panel): void {
		setPanel((current) => (current === next ? "none" : next));
	}

	function handleBid(event: React.FormEvent): void {
		event.preventDefault();
		const bidder = buyerIdentity;
		if (!bidder || bidBelowMinimum) {
			return;
		}
		const amount = bidAmount;
		confirmX402(
			{
				title: "Place auction bid",
				subject: listing.name,
				amount,
				asset: listing.price.asset,
				recipient: listing.seller,
				note: "Your bid is locked via x402; you only pay if you win.",
				confirmLabel: "Place bid",
			},
			async () => {
				await placeBid.mutateAsync({
					bid: {
						bidder: bidder.username,
						price: { amount, asset: "USDC", network: SOLANA_NETWORK },
					},
					listingId: listing.listingId,
				});
				setBidAmount("");
				setPanel("none");
			}
		);
	}

	function handleOffer(event: React.FormEvent): void {
		event.preventDefault();
		const buyer = buyerIdentity;
		if (!buyer) {
			return;
		}
		const amount = offerAmount;
		confirmX402(
			{
				title: "Make an offer",
				subject: listing.name,
				amount,
				asset: listing.price.asset,
				recipient: listing.seller,
				note: "Funds are authorized now and only move if the seller accepts.",
				confirmLabel: "Submit offer",
			},
			async () => {
				await createOffer.mutateAsync({
					buyer: buyer.username,
					name: listing.name,
					price: { amount, asset: "USDC", network: SOLANA_NETWORK },
				});
				setOfferAmount("");
				setPanel("none");
			}
		);
	}

	return (
		<div
			className={`rounded-lg border p-3 ${cardClass}`}
			data-testid={`listing-${listing.name}`}
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
				{isAuction && (
					<span className="rounded-full bg-orange-600/20 px-2 py-0.5 text-xs font-medium text-orange-500">
						Auction
					</span>
				)}
			</div>

			<div className="mt-2 flex items-center justify-between">
				<div>
					<div className={`text-xs font-semibold ${headingClass}`}>
						{isAuction
							? `${highest ? formatPrice(highest) : formatPrice(listing.price)}${highest ? " bid" : " start"}`
							: formatPrice(listing.price)}
					</div>
					<div className={`text-xs ${secondaryClass}`}>by {listing.seller}</div>
				</div>
				<div className="flex gap-1">
					<button
						className={ghost}
						type="button"
						onClick={(): void => {
							togglePanel("details");
						}}
					>
						Details
					</button>
					{isAuction ? (
						<button
							className={`${accentButtonClass(isDark, "orange")} px-3 py-1`}
							disabled={!canActAsBuyer || placeBid.isPending}
							type="button"
							onClick={(): void => {
								togglePanel("bid");
							}}
						>
							Bid
						</button>
					) : (
						<button
							className={`${accentButtonClass(isDark, "blue")} px-3 py-1`}
							disabled={!canActAsBuyer || buyListing.isPending}
							type="button"
							onClick={(): void => {
								const wallet = agentId;
								const buyer = buyerIdentity;
								if (!wallet || !buyer) {
									return;
								}
								confirmX402(
									{
										title: "Buy identity",
										subject: listing.name,
										amount: listing.price.amount,
										asset: listing.price.asset,
										recipient: listing.seller,
										note: "Settled on-chain via the tiny.place facilitator.",
										confirmLabel: "Buy",
									},
									() =>
										buyListing.mutateAsync({
											buyer: buyer.username,
											buyerCryptoId: wallet,
											listingId: listing.listingId,
										})
								);
							}}
						>
							{buyListing.isPending ? "Buying…" : "Buy"}
						</button>
					)}
					{canActAsBuyer && (
						<button
							className={ghost}
							type="button"
							onClick={(): void => {
								togglePanel("offer");
							}}
						>
							Offer
						</button>
					)}
				</div>
			</div>

			{/* Seller can settle their own auction once it has expired. */}
			{isAuction && isOwnListing && expired && (
				<button
					className={`${accentButtonClass(isDark, "emerald")} mt-2 w-full px-3 py-1.5`}
					disabled={closeAuction.isPending}
					type="button"
					onClick={(): void => {
						closeAuction.mutate({
							listingId: listing.listingId,
							sellerId: agentId,
						});
					}}
				>
					{closeAuction.isPending ? "Closing…" : "Close auction & settle"}
				</button>
			)}

			{panel === "details" && (
				<div className={`mt-2 space-y-1 text-xs ${secondaryClass}`}>
					<p>
						{listing.description ||
							(isAuction ? "Auction listing" : "Fixed-price identity listing")}
					</p>
					{isAuction && listing.reservePrice && (
						<p>Reserve: {formatPrice(listing.reservePrice)}</p>
					)}
					{isAuction && listing.expiresAt && (
						<p>
							{expired ? "Ended" : "Ends"} {listing.expiresAt.slice(0, 10)}
						</p>
					)}
				</div>
			)}

			{panel === "bid" && (
				<form className="mt-2 space-y-2" onSubmit={handleBid}>
					<input
						required
						className={inputClass}
						min={minBid}
						placeholder={`At least ${minBid} ${listing.price.asset}`}
						step="1"
						type="number"
						value={bidAmount}
						onChange={(event): void => {
							setBidAmount(event.target.value);
						}}
					/>
					<p className={`text-xs ${secondaryClass}`}>
						Minimum bid: {minBid} {listing.price.asset}
						{highest ? " (5% above the current bid)" : ""}
					</p>
					<button
						className={`${accentButtonClass(isDark, "orange")} w-full px-3 py-1.5`}
						disabled={placeBid.isPending || bidBelowMinimum}
						type="submit"
					>
						{placeBid.isPending ? "Bidding…" : "Place bid"}
					</button>
				</form>
			)}

			{panel === "offer" && (
				<form className="mt-2 space-y-2" onSubmit={handleOffer}>
					<input
						required
						className={inputClass}
						min="0"
						placeholder="Offer amount (USDC)"
						step="0.01"
						type="number"
						value={offerAmount}
						onChange={(event): void => {
							setOfferAmount(event.target.value);
						}}
					/>
					<button
						className={`${accentButtonClass(isDark, "blue")} w-full px-3 py-1.5`}
						disabled={createOffer.isPending || !offerAmount}
						type="submit"
					>
						{createOffer.isPending ? "Submitting…" : `Offer on ${listing.name}`}
					</button>
				</form>
			)}

			{closeAuction.isError && (
				<p className="mt-2 text-xs text-rose-500">
					{closeAuction.error instanceof Error
						? closeAuction.error.message
						: "Failed to close auction"}
				</p>
			)}
		</div>
	);
}
