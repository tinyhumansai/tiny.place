import type { X402AuthorizationFields } from "@tinyhumansai/tinyplace";

import { sameAsset } from "@src/common/x402-assets";

/**
 * Shape of the server-supplied payment portion of an HTTP 402 challenge. The
 * server may omit `expiresAt`/`nonce` (the client fills those in before signing),
 * but the money-bearing fields (`amount`, `asset`, `to`, `network`, `scheme`)
 * must be present so the wallet never signs an under-specified authorization.
 */
export type X402ChallengePayment = Omit<
	X402AuthorizationFields,
	"expiresAt" | "nonce"
> &
	Partial<Pick<X402AuthorizationFields, "expiresAt" | "nonce">>;

/**
 * What the client believes it is paying for. Any field left undefined is not
 * checked (used where a trustworthy expected value genuinely isn't known
 * client-side); fields that are provided MUST match the challenge exactly or
 * validation throws.
 */
export interface ExpectedX402Payment {
	/** Expected payment amount, in the asset's minor units (string-compared). */
	amount?: string;
	/** Expected asset/token identifier (e.g. mint address or "USDC"). */
	asset?: string;
	/** Expected recipient (facilitator/payee) address. */
	to?: string;
	/** Expected settlement network. */
	network?: string;
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validates a server-supplied 402 challenge payment before the wallet signs it.
 *
 * Two layers of defence:
 *  1. Well-formedness — the money-bearing fields (`amount`, `asset`, `to`,
 *     `network`, `scheme`) must be present and non-empty, so the wallet never
 *     signs an under-specified authorization.
 *  2. Expected-value binding — where the caller knows what the user agreed to
 *     pay (price/asset/recipient), the corresponding challenge field must match
 *     exactly. A tampered challenge (inflated `amount`, attacker `to`, swapped
 *     `asset`/`network`) is rejected here, before any signature is produced.
 *
 * @throws Error when the challenge is malformed or diverges from `expected`.
 */
export function assertValidX402Challenge(
	payment: X402ChallengePayment | null | undefined,
	expected: ExpectedX402Payment = {}
): asserts payment is X402ChallengePayment {
	if (!payment || typeof payment !== "object") {
		throw new Error("Payment challenge is missing or malformed.");
	}

	for (const field of ["amount", "asset", "to", "network", "scheme"] as const) {
		if (!isNonEmptyString(payment[field])) {
			throw new Error(
				`Payment challenge is missing required field "${field}".`
			);
		}
	}

	if (expected.amount !== undefined && payment.amount !== expected.amount) {
		throw new Error(
			`Payment amount mismatch: challenge requests "${payment.amount}" but expected "${expected.amount}".`
		);
	}
	// The challenge advertises the SPL mint address in `asset`, while a caller's
	// expected value is often the symbol it listed in ("USDC"). Compare by token
	// identity so a symbol expectation matches a mint-valued challenge (and vice
	// versa) — a genuinely swapped asset still fails.
	if (
		expected.asset !== undefined &&
		!sameAsset(payment.asset, expected.asset)
	) {
		throw new Error(
			`Payment asset mismatch: challenge requests "${payment.asset}" but expected "${expected.asset}".`
		);
	}
	if (expected.to !== undefined && payment.to !== expected.to) {
		throw new Error(
			`Payment recipient mismatch: challenge pays "${payment.to}" but expected "${expected.to}".`
		);
	}
	if (expected.network !== undefined && payment.network !== expected.network) {
		throw new Error(
			`Payment network mismatch: challenge uses "${payment.network}" but expected "${expected.network}".`
		);
	}
}
