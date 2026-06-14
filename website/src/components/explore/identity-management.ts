// Pure helpers for the identity management hub, kept free of React / `@src`
// aliased imports so they can be unit-tested in isolation. `@solana/web3.js` is
// a leaf dependency and safe to import here.

import { PublicKey } from "@solana/web3.js";
import { publicKeyToBase64 } from "@tinyhumansai/tinyplace";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Strips any leading `@` from a handle for display/keying. */
export function strip(name: string): string {
	return name.replace(/^@+/, "");
}

/**
 * Returns whole days until `expiresAt` (negative once expired), or `null` when
 * the timestamp is missing or unparseable. `now` is injectable for tests.
 */
export function daysLeft(
	expiresAt: string | undefined,
	now: number = Date.now()
): number | null {
	if (!expiresAt) {
		return null;
	}
	const expiry = new Date(expiresAt).getTime();
	if (Number.isNaN(expiry)) {
		return null;
	}
	return Math.ceil((expiry - now) / MS_PER_DAY);
}

/** Human-readable expiry label (e.g. "12d left", "expired 3d ago"). */
export function expiryLabel(
	expiresAt: string | undefined,
	now: number = Date.now()
): string | null {
	const remaining = daysLeft(expiresAt, now);
	if (remaining === null) {
		return null;
	}
	return remaining < 0
		? `expired ${String(Math.abs(remaining))}d ago`
		: `${String(remaining)}d left`;
}

/** Tailwind classes tinting an identity's lifecycle status badge. */
export function statusTone(status: string): string {
	switch (status) {
		case "active":
			return "bg-emerald-600/20 text-emerald-500";
		case "expiring":
			return "bg-amber-600/20 text-amber-500";
		case "auction":
			return "bg-orange-600/20 text-orange-500";
		default:
			return "bg-neutral-600/20 text-neutral-400";
	}
}

/**
 * Derives the recipient `cryptoId` + base64 `publicKey` from a Solana wallet
 * address for a direct transfer. Throws if the address is not a valid Solana
 * public key, so callers can surface a validation message before signing.
 */
export function deriveRecipient(address: string): {
	cryptoId: string;
	publicKey: string;
} {
	const key = new PublicKey(address.trim());
	return {
		cryptoId: key.toBase58(),
		publicKey: publicKeyToBase64(key.toBytes()),
	};
}
