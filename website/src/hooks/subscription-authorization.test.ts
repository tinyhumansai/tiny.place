import {
	buildCanonicalMessage,
	type SubscriptionPlan,
} from "@tinyhumansai/tinyplace";
import { describe, expect, it } from "vitest";

import {
	buildSubscriptionAuthorizationFields,
	subscriptionAuthorizationExpiresAt,
} from "./subscription-authorization";

const plan: SubscriptionPlan = {
	amount: "10",
	asset: "USDC",
	network: "solana:devnet",
	interval: "monthly",
};

describe("subscription authorization expiry", () => {
	it("returns a non-empty, future ISO timestamp", () => {
		const now = Date.UTC(2026, 0, 1);
		const expiresAt = subscriptionAuthorizationExpiresAt("monthly", now);

		expect(expiresAt).not.toBe("");
		expect(Number.isNaN(Date.parse(expiresAt))).toBe(false);
		expect(Date.parse(expiresAt)).toBeGreaterThan(now);
	});

	it("bounds an unknown interval to a finite future window", () => {
		const now = Date.UTC(2026, 0, 1);
		const expiresAt = subscriptionAuthorizationExpiresAt("eternity", now);

		expect(expiresAt).not.toBe("");
		const deltaMs = Date.parse(expiresAt) - now;
		expect(deltaMs).toBeGreaterThan(0);
		// Must stay well under a year so the mandate is genuinely time-limited.
		expect(deltaMs).toBeLessThan(400 * 24 * 60 * 60 * 1000);
	});

	it("scales the bound with the interval", () => {
		const now = Date.UTC(2026, 0, 1);
		const daily = Date.parse(subscriptionAuthorizationExpiresAt("daily", now));
		const monthly = Date.parse(
			subscriptionAuthorizationExpiresAt("monthly", now)
		);

		expect(monthly).toBeGreaterThan(daily);
	});
});

describe("buildSubscriptionAuthorizationFields", () => {
	it("builds a create-subscription mandate with a bounded, future expiresAt", () => {
		const now = Date.UTC(2026, 0, 1);
		const fields = buildSubscriptionAuthorizationFields({
			subscriptionId: "sub_create",
			plan,
			from: "@subscriber",
			to: "@provider",
			now,
		});

		expect(fields.expiresAt).not.toBe("");
		expect(Number.isNaN(Date.parse(fields.expiresAt))).toBe(false);
		expect(Date.parse(fields.expiresAt)).toBeGreaterThan(now);
		expect(fields.scheme).toBe("exact");
		expect(fields.nonce).toBe("subscription:sub_create:authorization");
	});

	it("builds a renew-subscription mandate with a bounded, future expiresAt", () => {
		const now = Date.UTC(2026, 0, 1);
		const fields = buildSubscriptionAuthorizationFields({
			subscriptionId: "sub_renew",
			plan,
			from: "@subscriber",
			to: "@provider",
			now,
		});

		expect(fields.expiresAt).not.toBe("");
		expect(Date.parse(fields.expiresAt)).toBeGreaterThan(now);
	});

	it("keeps expiresAt in the canonical signed message (not dropped as empty)", () => {
		const now = Date.UTC(2026, 0, 1);
		const fields = buildSubscriptionAuthorizationFields({
			subscriptionId: "sub_signed",
			plan,
			from: "@subscriber",
			to: "@provider",
			now,
		});

		const message = buildCanonicalMessage(fields);
		const parsed = JSON.parse(message) as { expiresAt?: string };

		// buildCanonicalMessage drops empty expiresAt; a bounded mandate must
		// retain it so the signed payload is genuinely time-limited.
		expect(parsed.expiresAt).toBe(fields.expiresAt);
		expect(parsed.expiresAt).not.toBe("");
	});
});
