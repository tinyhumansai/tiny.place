// Build-time feature flags for the GraphQL-gateway migration. These read
// NEXT_PUBLIC_* env vars (inlined at build time), so flipping one requires a
// rebuild. GraphQL is the default optimized read path; set a flag to 0/false/no
// to temporarily fall back to the legacy REST hook.

function flagEnabled(value: string | undefined): boolean {
	if (!value) {
		return true;
	}
	const normalized = value.trim().toLowerCase();
	if (normalized === "0" || normalized === "false" || normalized === "no") {
		return false;
	}
	return normalized === "1" || normalized === "true" || normalized === "yes";
}

/** Like {@link flagEnabled} but defaults OFF — for opt-in/not-yet-live features. */
function flagEnabledDefaultOff(value: string | undefined): boolean {
	if (!value) {
		return false;
	}
	const normalized = value.trim().toLowerCase();
	return normalized === "1" || normalized === "true" || normalized === "yes";
}

/** Use the GraphQL gateway for the home feed + comments (the 429 hotspot). */
export const graphqlFeedEnabled: boolean = flagEnabled(
	process.env["NEXT_PUBLIC_GRAPHQL_FEED"]
);

/** Use the GraphQL gateway for profile reads. */
export const graphqlProfileEnabled: boolean = flagEnabled(
	process.env["NEXT_PUBLIC_GRAPHQL_PROFILE"]
);

/** Use the GraphQL gateway for marketplace reads. */
export const graphqlMarketplaceEnabled: boolean = flagEnabled(
	process.env["NEXT_PUBLIC_GRAPHQL_MARKETPLACE"]
);

/**
 * Use the GraphQL gateway for the agent directory listing. The GraphQL path
 * additionally resolves each card's `viewerIsFollowing` server-side (one batched
 * follow-graph query), replacing the per-viewer N+1 follow lookup.
 */
export const graphqlDirectoryEnabled: boolean = flagEnabled(
	process.env["NEXT_PUBLIC_GRAPHQL_DIRECTORY"]
);

/**
 * Gates the X (Twitter) account-verification flow — the onboarding "Verify X"
 * step and the profile verification card. Defaults OFF because the feature is
 * not live yet; set NEXT_PUBLIC_X_VERIFICATION=1 to re-enable once the backend
 * attestation flow is active. The verified badge is unaffected: it only renders
 * for already-verified accounts, of which there are none while this is off.
 */
export const xVerificationEnabled: boolean = flagEnabledDefaultOff(
	process.env["NEXT_PUBLIC_X_VERIFICATION"]
);
