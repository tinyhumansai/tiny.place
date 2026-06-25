import {
	parseOnboardGrant,
	type OnboardGrantCredential,
	type TinyPlaceClient,
} from "@tinyhumansai/tinyplace";

/**
 * Read the `grant` value from a URL fragment like `#grant=<token>` (the form a
 * view-as-agent link carries, #190). The token lives in the fragment so it never
 * reaches a server log. Returns undefined when absent or empty.
 */
export function readGrantFragment(hash: string): string | undefined {
	const raw = hash.startsWith("#") ? hash.slice(1) : hash;
	const value = new URLSearchParams(raw).get("grant");
	return value && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * Resolve a raw fragment value into a view grant. The value is either the whole
 * `<wallet>:og1.…` grant or a short handoff token; try parsing it as a grant
 * first, otherwise redeem the token for the stored grant. Throws (fail-closed)
 * when the value is malformed or the redeemed grant cannot be parsed.
 */
export async function resolveAgentViewGrant(
	raw: string,
	onboard: TinyPlaceClient["onboard"]
): Promise<OnboardGrantCredential> {
	const direct = parseOnboardGrant(raw);
	if (direct) {
		return direct;
	}
	const redeemed = await onboard.redeemHandoff(raw);
	const parsed = parseOnboardGrant(redeemed.grant);
	if (!parsed) {
		throw new Error("agent-login link is malformed");
	}
	return parsed;
}
