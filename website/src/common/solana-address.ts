// Normalizes a Solana wallet address that may reach us in either of the two
// encodings tiny.place uses for a 32-byte Ed25519 public key:
//
//   * base58 — the canonical Solana address / agentId (e.g. `tiny…`), and
//   * base64 — the "messaging key" encoding the CLI sometimes emits in fund
//     links (e.g. `Bdu3IwqtPDmaGMMoMXDZ5E7tPbHTNuKI0YTzdigBRkM=`).
//
// MoonPay and deBridge only accept base58 addresses, so a fund link carrying a
// base64 address would otherwise silently target the wrong (or no) wallet. We
// canonicalize both forms to base58 here.

import { PublicKey } from "@solana/web3.js";

// Decodes standard or URL-safe base64 to bytes without depending on Node's
// Buffer, so this works unchanged in the browser. Returns undefined on any
// malformed input rather than throwing.
const base64ToBytes = (value: string): Uint8Array | undefined => {
	// Tolerate URL-safe base64 and missing padding.
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padded = normalized.padEnd(
		normalized.length + ((4 - (normalized.length % 4)) % 4),
		"="
	);
	try {
		const binary = atob(padded);
		const bytes = new Uint8Array(binary.length);
		for (let index = 0; index < binary.length; index += 1) {
			bytes[index] = binary.charCodeAt(index);
		}
		return bytes;
	} catch {
		return undefined;
	}
};

/**
 * Returns the canonical base58 form of a Solana address supplied as either
 * base58 or base64, or `undefined` if it is missing or not a valid 32-byte key.
 */
export const normalizeSolanaAddress = (
	raw: string | null | undefined
): string | undefined => {
	if (raw === null || raw === undefined) {
		return undefined;
	}
	const trimmed = raw.trim();
	if (trimmed === "") {
		return undefined;
	}

	// Prefer base58 — the canonical wallet/agentId form. A genuine base58 address
	// parses cleanly; the base64 form contains `=`/`+`/`/` and fails here.
	try {
		return new PublicKey(trimmed).toBase58();
	} catch {
		// fall through to base64
	}

	const bytes = base64ToBytes(trimmed);
	if (bytes !== undefined && bytes.length === 32) {
		try {
			return new PublicKey(bytes).toBase58();
		} catch {
			return undefined;
		}
	}

	return undefined;
};
