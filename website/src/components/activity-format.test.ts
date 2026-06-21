import type { ActivityEvent } from "@tinyhumansai/tinyplace";
import { describe, expect, it } from "vitest";

import {
	describeActivity,
	iconFor,
	shortName,
} from "@src/components/activity-format";

// Fixtures mirror the real shapes returned by GET https://api.tiny.place/activity
// (the dominant kinds: social.post, identity.registered, escrow.fund).
const event = (overrides: Partial<ActivityEvent>): ActivityEvent => ({
	eventId: "evt_1",
	kind: "social.post",
	category: "social",
	timestamp: "2026-06-21T02:54:31.238Z",
	...overrides,
});

describe("shortName", () => {
	it("passes @handles through untouched", () => {
		expect(shortName("@overseer")).toBe("@overseer");
	});

	it("truncates long wallet pubkeys to head…tail", () => {
		expect(shortName("4Ep9Wp8DvaYgGHsFfS6RVZfGZstjjFeQZ1NS2Pojfam3")).toBe(
			"4Ep9…fam3"
		);
	});

	it("renames known system actors", () => {
		expect(shortName("tinyplace-escrow")).toBe("escrow");
	});

	it("falls back to 'someone' for empty values", () => {
		expect(shortName(null)).toBe("someone");
		expect(shortName(undefined)).toBe("someone");
	});
});

describe("describeActivity", () => {
	it("renders social.post (the most common kind) as a readable sentence, not a bare pubkey", () => {
		const text = describeActivity(
			event({
				kind: "social.post",
				actor: "4Ep9Wp8DvaYgGHsFfS6RVZfGZstjjFeQZ1NS2Pojfam3",
			})
		);
		expect(text).toBe("4Ep9…fam3 posted");
	});

	it("keeps a @handle actor intact on social.post", () => {
		expect(
			describeActivity(event({ kind: "social.post", actor: "@lexaa" }))
		).toBe("@lexaa posted");
	});

	it("leads identity.registered with the registered @handle from reference", () => {
		const text = describeActivity(
			event({
				kind: "identity.registered",
				category: "identity",
				actor: "4Ep9Wp8DvaYgGHsFfS6RVZfGZstjjFeQZ1NS2Pojfam3",
				reference: { kind: "identity", id: "@overseer" },
			})
		);
		expect(text).toBe("@overseer registered");
	});

	it("formats escrow.fund amounts from base units and recognises bounties", () => {
		const text = describeActivity(
			event({
				kind: "escrow.fund",
				category: "financial",
				actor: "5Swt9cgUUMmNTJdPmxp6VXCNn2Z6ScFsNiyoCLGTCxqQ",
				target: "tinyplace-escrow",
				amount: "1000000", // 6-decimal base units => 1 USDC
				asset: "USDC",
				reference: { kind: "bounty", id: "bnt_djed97st06ag3ou2ibs8kx4tb" },
			})
		);
		// Crucially NOT "1000000 USDC".
		expect(text).toBe("5Swt…CxqQ funded a bounty · 1 USDC");
	});

	it("degrades unknown social kinds to a sensible verb instead of a raw pubkey", () => {
		expect(
			describeActivity(
				event({ kind: "social.reaction", actor: "@lexaa", category: "social" })
			)
		).toBe("@lexaa reacted");
	});

	it("never renders an empty or pubkey-only string for an unmapped kind", () => {
		const text = describeActivity(
			event({
				kind: "ledger.SOMETHING_NEW",
				category: "financial",
				actor: "@x",
			})
		);
		expect(text).toBe("@x — SOMETHING NEW");
	});
});

describe("iconFor", () => {
	it("maps known kinds", () => {
		expect(iconFor(event({ kind: "social.post" }))).toBe("💬");
		expect(
			iconFor(event({ kind: "identity.registered", category: "identity" }))
		).toBe("✨");
	});

	it("falls back to a category icon for unmapped kinds", () => {
		expect(
			iconFor(event({ kind: "ledger.SOMETHING_NEW", category: "financial" }))
		).toBe("💸");
	});
});
