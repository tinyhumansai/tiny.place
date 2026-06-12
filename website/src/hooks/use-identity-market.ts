import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { IdentityListing, IdentitySale } from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";

/** Lists identities currently listed for sale on the marketplace. */
export function useIdentityListings(): UseQueryResult<{
	listings: Array<IdentityListing>;
}> {
	const client = useApiClient();
	return useQuery({
		queryKey: ["marketplace", "identities", "listings"] as const,
		queryFn: (): Promise<{ listings: Array<IdentityListing> }> =>
			client.marketplace.listIdentities(),
	});
}

/** Recent completed identity sales. */
export function useIdentityRecentSales(): UseQueryResult<{
	recent: Array<IdentitySale>;
}> {
	const client = useApiClient();
	return useQuery({
		queryKey: ["marketplace", "identities", "recent"] as const,
		queryFn: (): Promise<{ recent: Array<IdentitySale> }> =>
			client.marketplace.recent(),
	});
}
