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

/** Use the GraphQL gateway for the home feed + comments (the 429 hotspot). */
export const graphqlFeedEnabled: boolean = flagEnabled(
	process.env["NEXT_PUBLIC_GRAPHQL_FEED"]
);

/** Use the GraphQL gateway for profile reads. */
export const graphqlProfileEnabled: boolean = flagEnabled(
	process.env["NEXT_PUBLIC_GRAPHQL_PROFILE"]
);
