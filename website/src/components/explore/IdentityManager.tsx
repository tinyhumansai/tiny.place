"use client";

import { useState } from "react";

import type { Identity, IdentityListing } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import {
	useCreateIdentityListing,
	useDeleteIdentityListing,
} from "@src/hooks/use-identity-market";
import {
	useRenewIdentity,
	useSetPrimaryIdentity,
	useTransferIdentity,
} from "@src/hooks/use-registry";

import {
	deriveRecipient,
	expiryLabel,
	statusTone,
	strip,
} from "./identity-management";

// Native-SOL settlement network used for fixed-price identity listings; mirrors
// the value the marketplace uses elsewhere in the app.
const SOLANA_NETWORK = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

type IdentityCardProperties = {
	agentId: string;
	identity: Identity;
	isDark: boolean;
	listing: IdentityListing | undefined;
};

type ActionPanel = "none" | "list" | "transfer";

function IdentityCard({
	agentId,
	identity,
	isDark,
	listing,
}: IdentityCardProperties): FunctionComponent {
	const [panel, setPanel] = useState<ActionPanel>("none");
	const [price, setPrice] = useState("");
	const [description, setDescription] = useState("");
	const [recipient, setRecipient] = useState("");
	const [recipientError, setRecipientError] = useState<string | null>(null);
	const [confirmTransfer, setConfirmTransfer] = useState(false);

	const setPrimary = useSetPrimaryIdentity();
	const renew = useRenewIdentity();
	const createListing = useCreateIdentityListing();
	const deleteListing = useDeleteIdentityListing();
	const transfer = useTransferIdentity();

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
	const labelClass = `text-xs font-medium ${secondaryClass}`;
	const ghostButton =
		"rounded-md border border-neutral-600 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-neutral-700/30 disabled:opacity-50";

	const isPrimary = Boolean(identity.primary);
	const isListed = Boolean(listing);
	const expiry = expiryLabel(identity.expiresAt);

	function togglePanel(next: ActionPanel): void {
		setPanel((current) => (current === next ? "none" : next));
		setRecipientError(null);
		setConfirmTransfer(false);
	}

	function handleList(event: React.FormEvent): void {
		event.preventDefault();
		createListing.mutate(
			{
				description,
				name: identity.username,
				price: { amount: price, asset: "USDC", network: SOLANA_NETWORK },
				seller: identity.username,
				sellerCryptoId: agentId,
			},
			{
				onSuccess: (): void => {
					setPrice("");
					setDescription("");
					setPanel("none");
				},
			}
		);
	}

	function handleTransfer(event: React.FormEvent): void {
		event.preventDefault();
		let recipientKeys: { cryptoId: string; publicKey: string };
		try {
			recipientKeys = deriveRecipient(recipient);
		} catch {
			setRecipientError("Enter a valid Solana wallet address");
			return;
		}
		if (recipientKeys.cryptoId === agentId) {
			setRecipientError("That is your own wallet");
			return;
		}
		setRecipientError(null);
		transfer.mutate(
			{
				cryptoId: recipientKeys.cryptoId,
				name: identity.username,
				publicKey: recipientKeys.publicKey,
			},
			{
				onSuccess: (): void => {
					setRecipient("");
					setConfirmTransfer(false);
					setPanel("none");
				},
			}
		);
	}

	return (
		<li className={`rounded-lg border p-3 ${cardClass}`}>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<span className={`text-sm font-medium ${headingClass}`}>
						{identity.username}
					</span>
					{isPrimary && (
						<span className="rounded-full bg-emerald-600/20 px-2 py-0.5 text-xs font-medium text-emerald-500">
							Primary
						</span>
					)}
					{isListed && (
						<span className="rounded-full bg-blue-600/20 px-2 py-0.5 text-xs font-medium text-blue-400">
							Listed · {listing?.price.amount} {listing?.price.asset}
						</span>
					)}
				</div>
				<div className="flex items-center gap-2">
					<span
						className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusTone(identity.status)}`}
					>
						{identity.status}
					</span>
					{expiry && (
						<span className={`text-xs ${secondaryClass}`}>{expiry}</span>
					)}
				</div>
			</div>

			{identity.subnames && identity.subnames.length > 0 && (
				<p className={`mt-1 text-xs ${secondaryClass}`}>
					{identity.subnames.length} subname
					{identity.subnames.length === 1 ? "" : "s"}
				</p>
			)}

			<div className="mt-2 flex flex-wrap gap-1.5">
				<button
					className={ghostButton}
					disabled={setPrimary.isPending}
					type="button"
					onClick={(): void => {
						setPrimary.mutate({
							name: identity.username,
							primary: !isPrimary,
						});
					}}
				>
					{isPrimary ? "Unassign primary" : "Set primary"}
				</button>
				<button
					className={ghostButton}
					disabled={renew.isPending}
					type="button"
					onClick={(): void => {
						renew.mutate({ name: identity.username });
					}}
				>
					{renew.isPending ? "Renewing…" : "Renew"}
				</button>
				{isListed ? (
					<button
						className={ghostButton}
						disabled={deleteListing.isPending || !listing}
						type="button"
						onClick={(): void => {
							if (listing) {
								deleteListing.mutate(listing.listingId);
							}
						}}
					>
						{deleteListing.isPending ? "Cancelling…" : "Cancel listing"}
					</button>
				) : (
					<button
						className={ghostButton}
						disabled={isPrimary}
						type="button"
						title={
							isPrimary ? "Unassign the primary handle before selling it" : ""
						}
						onClick={(): void => {
							togglePanel("list");
						}}
					>
						List for sale
					</button>
				)}
				<button
					className={ghostButton}
					disabled={isPrimary}
					type="button"
					title={
						isPrimary
							? "Unassign the primary handle before transferring it"
							: ""
					}
					onClick={(): void => {
						togglePanel("transfer");
					}}
				>
					Transfer
				</button>
			</div>

			{renew.isError && (
				<p className="mt-2 text-xs text-rose-500">
					{renew.error instanceof Error
						? renew.error.message
						: "Renewal failed"}
				</p>
			)}
			{setPrimary.isError && (
				<p className="mt-2 text-xs text-rose-500">
					{setPrimary.error instanceof Error
						? setPrimary.error.message
						: "Failed to update primary"}
				</p>
			)}
			{deleteListing.isError && (
				<p className="mt-2 text-xs text-rose-500">
					{deleteListing.error instanceof Error
						? deleteListing.error.message
						: "Failed to cancel listing"}
				</p>
			)}

			{panel === "list" && (
				<form className="mt-3 space-y-2" onSubmit={handleList}>
					<div className="grid grid-cols-2 gap-2">
						<div>
							<label className={labelClass}>Price (USDC)</label>
							<input
								required
								className={inputClass}
								min="0"
								placeholder="25.00"
								step="0.01"
								type="number"
								value={price}
								onChange={(event): void => {
									setPrice(event.target.value);
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
						<p className="text-xs text-rose-500">
							{createListing.error instanceof Error
								? createListing.error.message
								: "Failed to list identity"}
						</p>
					)}
					<button
						className="w-full rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
						disabled={createListing.isPending || !price}
						type="submit"
					>
						{createListing.isPending ? "Listing…" : `List ${identity.username}`}
					</button>
				</form>
			)}

			{panel === "transfer" && (
				<form className="mt-3 space-y-2" onSubmit={handleTransfer}>
					<div>
						<label className={labelClass}>Recipient wallet address</label>
						<input
							required
							className={inputClass}
							placeholder="Solana address"
							type="text"
							value={recipient}
							onChange={(event): void => {
								setRecipient(event.target.value);
								setRecipientError(null);
							}}
						/>
					</div>
					<label
						className={`flex items-center gap-2 text-xs ${secondaryClass}`}
					>
						<input
							checked={confirmTransfer}
							type="checkbox"
							onChange={(event): void => {
								setConfirmTransfer(event.target.checked);
							}}
						/>
						I understand this permanently gives {identity.username} to another
						wallet.
					</label>
					{recipientError && (
						<p className="text-xs text-rose-500">{recipientError}</p>
					)}
					{transfer.isError && (
						<p className="text-xs text-rose-500">
							{transfer.error instanceof Error
								? transfer.error.message
								: "Transfer failed"}
						</p>
					)}
					<button
						className="w-full rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-rose-500 disabled:opacity-50"
						disabled={transfer.isPending || !confirmTransfer || !recipient}
						type="submit"
					>
						{transfer.isPending
							? "Transferring…"
							: `Transfer ${strip(identity.username)}`}
					</button>
				</form>
			)}
		</li>
	);
}

type IdentityManagerProperties = {
	agentId: string;
	identities: Array<Identity>;
	isDark: boolean;
	listings: Array<IdentityListing>;
};

// IdentityManager is the connected wallet's identity control panel: for each
// name it owns it surfaces lifecycle detail (status, expiry, subnames) and the
// owner actions — set/unassign primary, renew, list/cancel a sale, and direct
// transfer to another wallet.
export function IdentityManager({
	agentId,
	identities,
	isDark,
	listings,
}: IdentityManagerProperties): FunctionComponent {
	const cardClass = isDark
		? "border-neutral-800 bg-neutral-950"
		: "border-neutral-200 bg-neutral-50";
	const headingClass = isDark ? "text-white" : "text-black";

	if (identities.length === 0) {
		return null;
	}

	// Match a name to its active listing so the card can show "Listed" + a
	// cancel action instead of the list form.
	const listingByName = new Map<string, IdentityListing>();
	for (const listing of listings) {
		listingByName.set(strip(listing.name).toLowerCase(), listing);
	}

	return (
		<div className={`rounded-lg border p-4 ${cardClass}`}>
			<h3 className={`mb-3 text-sm font-medium ${headingClass}`}>
				Your Identities
			</h3>
			<ul className="space-y-2">
				{identities.map((identity) => (
					<IdentityCard
						key={identity.username}
						agentId={agentId}
						identity={identity}
						isDark={isDark}
						listing={listingByName.get(strip(identity.username).toLowerCase())}
					/>
				))}
			</ul>
		</div>
	);
}
