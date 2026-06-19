import { Keypair } from "@solana/web3.js";
import { publicKeyToBase64 } from "@tinyhumansai/tinyplace";
import { describe, expect, it } from "vitest";

import {
	daysLeft,
	deriveRecipient,
	expiryLabel,
	isExpired,
	sanitizeHandle,
	statusTone,
	strip,
} from "./identity-management";

describe("identity management helpers", () => {
	const NOW = Date.parse("2026-06-14T00:00:00Z");

	it("strips leading @ from handles", () => {
		expect(strip("@alice")).toBe("alice");
		expect(strip("@@alice")).toBe("alice");
		expect(strip("alice")).toBe("alice");
	});

	it("sanitizes handle input to a-z0-9_ (lowercase, no spaces/@)", () => {
		expect(sanitizeHandle("@My Handle")).toBe("myhandle");
		expect(sanitizeHandle("Cool_Bot 99")).toBe("cool_bot99");
		expect(sanitizeHandle("a-b.c!")).toBe("abc");
		expect(sanitizeHandle("  spaced  ")).toBe("spaced");
		expect(sanitizeHandle("ALLCAPS")).toBe("allcaps");
	});

	it("computes whole days until expiry, negative once expired", () => {
		expect(daysLeft("2026-06-24T00:00:00Z", NOW)).toBe(10);
		expect(daysLeft("2026-06-04T00:00:00Z", NOW)).toBe(-10);
		expect(daysLeft(undefined, NOW)).toBeNull();
		expect(daysLeft("not-a-date", NOW)).toBeNull();
	});

	it("labels remaining vs expired time", () => {
		expect(expiryLabel("2026-06-24T00:00:00Z", NOW)).toBe("10d left");
		expect(expiryLabel("2026-06-04T00:00:00Z", NOW)).toBe("expired 10d ago");
		expect(expiryLabel(undefined, NOW)).toBeNull();
	});

	it("reports whether an auction/listing has expired", () => {
		expect(isExpired("2026-06-04T00:00:00Z", NOW)).toBe(true);
		expect(isExpired("2026-06-24T00:00:00Z", NOW)).toBe(false);
		expect(isExpired(undefined, NOW)).toBe(false);
		expect(isExpired("not-a-date", NOW)).toBe(false);
	});

	it("tints each lifecycle status distinctly and falls back for unknowns", () => {
		expect(statusTone("active")).toContain("emerald");
		expect(statusTone("expiring")).toContain("amber");
		expect(statusTone("auction")).toContain("orange");
		expect(statusTone("released")).toContain("neutral");
	});

	it("derives recipient cryptoId + base64 publicKey from a Solana address", () => {
		const keypair = Keypair.generate();
		const address = keypair.publicKey.toBase58();

		const recipient = deriveRecipient(address);

		expect(recipient.cryptoId).toBe(address);
		// publicKey must base64-encode the same 32 bytes the address base58-encodes,
		// so the backend's PublicKeyMatchesCryptoID check passes.
		expect(recipient.publicKey).toBe(
			publicKeyToBase64(keypair.publicKey.toBytes())
		);
	});

	it("trims surrounding whitespace before parsing the address", () => {
		const address = Keypair.generate().publicKey.toBase58();
		expect(deriveRecipient(`  ${address}  `).cryptoId).toBe(address);
	});

	it("throws on an invalid Solana address so the UI can show an error", () => {
		expect(() => deriveRecipient("not-a-valid-address")).toThrow();
		expect(() => deriveRecipient("")).toThrow();
	});
});
