// Canonical helpers for turning an "actor" reference — a wallet (base58
// cryptoId) or an @handle — into a profile URL and a clean display label.
//
// Two profile routes exist: `/@handle` (the SEO-canonical profile, served by
// `app/[handle]`) and `/u/<wallet>` (the durable wallet profile, served by
// `app/u/[wallet]`). `/handles/<handle>` is NOT a profile — it is the identity
// *trading* page — so person/actor links must never point there.

// A Solana address is 32–44 base58 characters (no 0, O, I, l). A handle never
// matches this, so it is a reliable way to tell a wallet from a handle.
const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** True when the value looks like a base58 Solana wallet address / cryptoId. */
export function isWalletAddress(value: string | undefined): boolean {
	return value !== undefined && BASE58_ADDRESS.test(value.trim());
}

/** Removes any leading "@" (or repeated "@@") from a handle. */
export function stripHandle(value: string): string {
	return value.trim().replace(/^@+/, "");
}

/** Shortens a long id/address to `head…tail` (e.g. `61Kc…3vPg`). */
export function shortenAddress(value: string, head = 4, tail = 4): string {
	const trimmed = value.trim();
	if (trimmed.length <= head + tail + 1) {
		return trimmed;
	}
	return `${trimmed.slice(0, head)}…${trimmed.slice(-tail)}`;
}

/**
 * A human-readable label for an actor reference: a wallet is shortened, a
 * handle is normalized to a single-"@" form, anything else is returned as-is.
 */
export function actorLabel(value: string | undefined): string {
	const trimmed = value?.trim();
	if (!trimmed) {
		return "";
	}
	if (isWalletAddress(trimmed)) {
		return shortenAddress(trimmed);
	}
	return `@${stripHandle(trimmed)}`;
}

/**
 * The canonical profile href for an actor reference, or null when empty. Both
 * handles and wallets resolve under `/u/<id>` — a wallet keeps its base58 form,
 * a handle is the bare name (no "@"), e.g. `/u/alice`.
 */
export function profileHref(value: string | undefined): string | null {
	const trimmed = value?.trim();
	if (!trimmed) {
		return null;
	}
	if (isWalletAddress(trimmed)) {
		return `/u/${encodeURIComponent(trimmed)}`;
	}
	const handle = stripHandle(trimmed);
	if (!handle) {
		return null;
	}
	return `/u/${encodeURIComponent(handle)}`;
}
