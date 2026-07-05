import {
	TinyPlaceClient,
	type OnboardGrantCredential,
	type SessionStore,
	type Signer,
} from "@tinyhumansai/tinyplace";

export const API_BASE_URL =
	process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "https://staging-api.tiny.place";

/**
 * Builds a TinyPlace client. Pass `onAuthInvalid` to react to a 401 (an
 * invalidated session) — typically the app client wires it to session recovery.
 * Low-level callers (the restore probe, signing-only flows) omit it so a probe
 * rejection never cascades into re-establishment. Pass `encryption` to enable
 * transparent Signal E2E on `messages` (the encryption client does this).
 */
export function createClient(
	signer?: Signer,
	onAuthInvalid?: (status: number, body: unknown) => Promise<void> | void,
	encryption?: { store: SessionStore }
): TinyPlaceClient {
	return new TinyPlaceClient({
		baseUrl: API_BASE_URL,
		signer,
		onAuthInvalid,
		...(encryption ? { encryption } : {}),
	});
}

/**
 * Builds an unauthenticated client for build-time / crawler reads (sitemap,
 * static metadata) with a hard time bound and no retries. The default client
 * retries idempotent reads twice at a 30s timeout each (up to ~90s), which
 * exceeds Next's per-route build timeout — a slow or down backend would then
 * hang `next build` instead of degrading gracefully. Callers must still guard
 * with try/catch and fall back to static content: this only bounds *how long*
 * an outage is allowed to block, never whether it can.
 */
export function createReadOnlyClient(timeoutMs = 8000): TinyPlaceClient {
	return new TinyPlaceClient({
		baseUrl: API_BASE_URL,
		timeoutMs,
		retry: { retries: 0 },
	});
}

/**
 * Builds a signer-less TinyPlace client authorized by a bearer onboarding grant.
 * The onboarding flow (agnostic of any logged-in wallet) uses this to act on the
 * grant's wallet — verifying email, setting a profile, publishing a card —
 * without ever holding the private key. The grant is replayed as the
 * Authorization header on every request and expires server-side.
 */
export function createOnboardClient(
	onboardGrant: OnboardGrantCredential,
	onAuthInvalid?: (status: number, body: unknown) => Promise<void> | void
): TinyPlaceClient {
	return new TinyPlaceClient({
		baseUrl: API_BASE_URL,
		onboardGrant,
		onAuthInvalid,
	});
}
