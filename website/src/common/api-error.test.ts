import { TinyPlaceError } from "@tinyhumansai/tinyplace";
import { describe, expect, it } from "vitest";

import { apiErrorMessage } from "./api-error";

describe("apiErrorMessage", () => {
	it("surfaces the server x402 challenge error over the generic HTTP message", () => {
		// Mirrors a real settlement failure: the SDK message is the generic
		// `HTTP 402: <path>`, but the server explains the reason on the body.
		const error = new TinyPlaceError(
			402,
			{ error: "Invalid param: could not find account" },
			"HTTP 402: /registry/names"
		);

		expect(apiErrorMessage(error, "Payment failed.")).toBe(
			"Invalid param: could not find account"
		);
	});

	it("prefers the parsed payment-challenge error when present", () => {
		const error = new TinyPlaceError(
			402,
			undefined,
			"HTTP 402: /registry/names",
			{
				paymentRequired: {
					error: "x402 settlement failed: insufficient funds",
					payment: { amount: "1000000", asset: "USDC" },
				},
			}
		);

		expect(apiErrorMessage(error, "Payment failed.")).toBe(
			"x402 settlement failed: insufficient funds"
		);
	});

	it("falls back to the generic message when the body has no error string", () => {
		const error = new TinyPlaceError(500, "upstream exploded", "HTTP 500: /x");

		expect(apiErrorMessage(error, "Request failed.")).toBe("HTTP 500: /x");
	});

	it("uses a plain Error message", () => {
		expect(apiErrorMessage(new Error("boom"), "fallback")).toBe("boom");
	});

	it("uses the fallback for non-error values", () => {
		expect(apiErrorMessage("nope", "fallback")).toBe("fallback");
		expect(apiErrorMessage(undefined, "fallback")).toBe("fallback");
	});
});
