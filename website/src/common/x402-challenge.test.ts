import { describe, expect, it } from "vitest";

import {
	assertValidX402Challenge,
	type ExpectedX402Payment,
	type X402ChallengePayment,
} from "./x402-challenge";

const baseChallenge: X402ChallengePayment = {
	scheme: "exact",
	network: "solana",
	asset: "USDC-mint",
	amount: "2000000",
	from: "",
	to: "facilitator-pubkey",
};

const expected: ExpectedX402Payment = {
	amount: "2000000",
	asset: "USDC-mint",
	to: "facilitator-pubkey",
	network: "solana",
};

describe("assertValidX402Challenge", () => {
	it("accepts a challenge that matches the expected listing/price", () => {
		expect(() => {
			assertValidX402Challenge({ ...baseChallenge }, expected);
		}).not.toThrow();
	});

	it("accepts a well-formed challenge when no expected values are known", () => {
		expect(() => {
			assertValidX402Challenge({ ...baseChallenge });
		}).not.toThrow();
	});

	it("rejects a tampered amount (inflated payment)", () => {
		expect(() => {
			assertValidX402Challenge(
				{ ...baseChallenge, amount: "999999999" },
				expected
			);
		}).toThrow(/amount mismatch/i);
	});

	it("rejects a tampered recipient (attacker 'to')", () => {
		expect(() => {
			assertValidX402Challenge(
				{ ...baseChallenge, to: "attacker-pubkey" },
				expected
			);
		}).toThrow(/recipient mismatch/i);
	});

	it("rejects a swapped asset", () => {
		expect(() => {
			assertValidX402Challenge(
				{ ...baseChallenge, asset: "evil-mint" },
				expected
			);
		}).toThrow(/asset mismatch/i);
	});

	it("accepts a symbol expectation against a mint-valued challenge", () => {
		// The caller expects the symbol it listed in ("USDC") but the challenge
		// now advertises the SPL mint address; they denote the same token.
		const usdcMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
		expect(() => {
			assertValidX402Challenge(
				{ ...baseChallenge, asset: usdcMint },
				{ ...expected, asset: "USDC" }
			);
		}).not.toThrow();
	});

	it("rejects a mint that denotes a different token than expected", () => {
		const wsolMint = "So11111111111111111111111111111111111111112";
		expect(() => {
			assertValidX402Challenge(
				{ ...baseChallenge, asset: wsolMint },
				{ ...expected, asset: "USDC" }
			);
		}).toThrow(/asset mismatch/i);
	});

	it("rejects a swapped network", () => {
		expect(() => {
			assertValidX402Challenge({ ...baseChallenge, network: "base" }, expected);
		}).toThrow(/network mismatch/i);
	});

	it("rejects a malformed challenge missing required money fields", () => {
		expect(() => {
			assertValidX402Challenge({ ...baseChallenge, amount: "" });
		}).toThrow(/missing required field "amount"/i);
		expect(() => {
			assertValidX402Challenge({ ...baseChallenge, to: "   " });
		}).toThrow(/missing required field "to"/i);
	});

	it("rejects a null/undefined challenge", () => {
		expect(() => {
			assertValidX402Challenge(null);
		}).toThrow(/missing or malformed/i);
		expect(() => {
			assertValidX402Challenge(undefined);
		}).toThrow(/missing or malformed/i);
	});
});
