import { TinyPlaceClient, type Signer } from "@tinyhumansai/tinyplace";

const API_BASE_URL =
	process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "https://staging-api.tiny.place";

/**
 * Builds a TinyPlace client. Pass `onAuthInvalid` to react to a 401 (an
 * invalidated session) — typically the app client wires it to session recovery.
 * Low-level callers (the restore probe, signing-only flows) omit it so a probe
 * rejection never cascades into re-establishment.
 */
export function createClient(
	signer?: Signer,
	onAuthInvalid?: (status: number, body: unknown) => void
): TinyPlaceClient {
	return new TinyPlaceClient({ baseUrl: API_BASE_URL, signer, onAuthInvalid });
}
