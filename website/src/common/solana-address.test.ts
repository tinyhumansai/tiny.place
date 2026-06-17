import { describe, expect, it } from "vitest";

import { normalizeSolanaAddress } from "./solana-address";

describe("normalizeSolanaAddress", () => {
	// The same 32-byte key in both encodings tiny.place emits.
	const base58 = "PsMeC7CZPffY9bHBqtS1oM1HmHjvwGcVqqGtY5LkfZ4";
	const base64 = "Bdu3IwqtPDmaGMMoMXDZ5E7tPbHTNuKI0YTzdigBRkM=";

	it("returns a canonical base58 address unchanged", () => {
		expect(normalizeSolanaAddress(base58)).toBe(base58);
	});

	it("converts a base64 (messaging-key) address to base58", () => {
		expect(normalizeSolanaAddress(base64)).toBe(base58);
	});

	it("accepts URL-safe base64 without padding", () => {
		const urlSafe = base64
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");
		expect(normalizeSolanaAddress(urlSafe)).toBe(base58);
	});

	it("trims surrounding whitespace", () => {
		expect(normalizeSolanaAddress(`  ${base58}  `)).toBe(base58);
	});

	it("returns undefined for missing or empty input", () => {
		expect(normalizeSolanaAddress(null)).toBeUndefined();
		expect(normalizeSolanaAddress(undefined)).toBeUndefined();
		expect(normalizeSolanaAddress("")).toBeUndefined();
		expect(normalizeSolanaAddress("   ")).toBeUndefined();
	});

	it("returns undefined for a non-key string", () => {
		expect(normalizeSolanaAddress("not-an-address")).toBeUndefined();
		// Valid base64 but not 32 bytes.
		expect(normalizeSolanaAddress("aGVsbG8=")).toBeUndefined();
	});
});
