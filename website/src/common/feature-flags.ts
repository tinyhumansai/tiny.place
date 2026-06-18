// Build-time feature flags for the incremental GraphQL-gateway migration. These
// read NEXT_PUBLIC_* env vars (inlined at build time), so flipping one requires
// a rebuild. Each screen branches on its flag to pick the batched GraphQL hook
// vs the legacy REST hook; REST stays the safe default until the gateway is
// verified against the running stack.

function flagEnabled(value: string | undefined): boolean {
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
