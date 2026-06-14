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
	useCloseIdentityAuction,
	useCreateIdentityOffer,
	usePlaceIdentityBid,
} from "@src/hooks/use-identity-market";

import { isExpired, strip } from "./identity-management";

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
	const pill =
		"rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50";

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

	function togglePanel(next: Panel): void {
		setPanel((current) => (current === next ? "none" : next));
	}

	function handleBid(event: React.FormEvent): void {
		event.preventDefault();
		if (!buyerIdentity) {
			return;
		}
		placeBid.mutate(
			{
				bid: {
					bidder: buyerIdentity.username,
					price: { amount: bidAmount, asset: "USDC", network: SOLANA_NETWORK },
				},
				listingId: listing.listingId,
			},
			{
				onSuccess: (): void => {
					setBidAmount("");
					setPanel("none");
				},
			}
		);
	}

	function handleOffer(event: React.FormEvent): void {
		event.preventDefault();
		if (!buyerIdentity) {
			return;
		}
		createOffer.mutate(
			{
				buyer: buyerIdentity.username,
				name: listing.name,
				price: { amount: offerAmount, asset: "USDC", network: SOLANA_NETWORK },
			},
			{
				onSuccess: (): void => {
					setOfferAmount("");
					setPanel("none");
				},
			}
		);
	}

	return (
		<div className={`rounded-lg border p-3 ${cardClass}`}>
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
						type="button"
						className={`${pill} ${
							isDark
								? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
								: "bg-neutral-200 text-neutral-600 hover:bg-neutral-300"
						}`}
						onClick={(): void => {
							togglePanel("details");
						}}
					>
						Details
					</button>
					{isAuction ? (
						<button
							className={`${pill} bg-orange-600 text-white hover:bg-orange-500`}
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
							className={`${pill} bg-neutral-900 text-white hover:bg-neutral-700`}
							disabled={!canActAsBuyer || buyListing.isPending}
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
							{buyListing.isPending ? "Buying…" : "Buy"}
						</button>
					)}
					{canActAsBuyer && (
						<button
							type="button"
							className={`${pill} ${
								isDark
									? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
									: "bg-neutral-200 text-neutral-600 hover:bg-neutral-300"
							}`}
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
					className="mt-2 w-full rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
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
						min="0"
						placeholder={`Bid more than ${highest ? formatPrice(highest) : formatPrice(listing.price)}`}
						step="0.01"
						type="number"
						value={bidAmount}
						onChange={(event): void => {
							setBidAmount(event.target.value);
						}}
					/>
					{placeBid.isError && (
						<p className="text-xs text-rose-500">
							{placeBid.error instanceof Error
								? placeBid.error.message
								: "Failed to place bid"}
						</p>
					)}
					<button
						className="w-full rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-orange-500 disabled:opacity-50"
						disabled={placeBid.isPending || !bidAmount}
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
					{createOffer.isError && (
						<p className="text-xs text-rose-500">
							{createOffer.error instanceof Error
								? createOffer.error.message
								: "Failed to make offer"}
						</p>
					)}
					{createOffer.isSuccess && (
						<p className="text-xs text-emerald-500">Offer submitted.</p>
					)}
					<button
						className="w-full rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
						disabled={createOffer.isPending || !offerAmount}
						type="submit"
					>
						{createOffer.isPending ? "Submitting…" : `Offer on ${listing.name}`}
					</button>
				</form>
			)}

			{(buyListing.isError || closeAuction.isError) && (
				<p className="mt-2 text-xs text-rose-500">
					{(buyListing.error ?? closeAuction.error) instanceof Error
						? ((buyListing.error ?? closeAuction.error) as Error).message
						: "Action failed"}
				</p>
			)}
		</div>
	);
}
