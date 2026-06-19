import { TinyPlaceError } from "@tinyhumansai/tinyplace";

/**
 * Turn an unknown thrown value into a message worth showing a user.
 *
 * The SDK deliberately keeps {@link TinyPlaceError.message} generic
 * (`HTTP <status>: <path>`) and preserves the server's explanation on the
 * response `body` / parsed x402 challenge instead. Surfacing only `.message`
 * therefore hides the actual reason — e.g. an x402 settlement that fails with
 * `"Invalid param: could not find account"` (the payer has no funded token
 * account) is shown to the user as a meaningless `HTTP 402: /registry/names`.
 *
 * This prefers, in order: the parsed payment-challenge error, a string `error`
 * on the response body, then the generic message, then the fallback.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof TinyPlaceError) {
		const challengeError = error.paymentRequired?.error;
		if (typeof challengeError === "string" && challengeError.trim()) {
			return challengeError;
		}
		const body = error.body;
		if (body && typeof body === "object" && "error" in body) {
			const bodyError = (body as { error?: unknown }).error;
			if (typeof bodyError === "string" && bodyError.trim()) {
				return bodyError;
			}
		}
		return error.message || fallback;
	}
	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}
	return fallback;
}
