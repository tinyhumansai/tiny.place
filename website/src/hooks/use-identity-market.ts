import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type {
	IdentityFloor,
	IdentityListing,
	IdentitySale,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";

/** Lists identities currently listed for sale on the marketplace. */
export function useIdentityListings(): UseQueryResult<{
	listings: Array<IdentityListing>;
}> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.directory.identities(),
		queryFn: async (): Promise<{ listings: Array<IdentityListing> }> => {
			const result = await client.directory.listIdentities();
			return { listings: result.identities };
		},
	});
}

/** Recent completed identity sales. */
export function useIdentityRecentSales(): UseQueryResult<{
	recent: Array<IdentitySale>;
}> {
	const client = useApiClient();
	return useQuery({
		queryKey: ["marketplace", "identities", "recent"] as const,
		queryFn: async (): Promise<{ recent: Array<IdentitySale> }> => {
			const result = await client.marketplace.recent();
			return { recent: result.sales };
		},
	});
}

/** Floor price for listed identities of a given label length. */
export function useIdentityFloor(length: number): UseQueryResult<IdentityFloor> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.marketplace.identityFloor(length),
		queryFn: (): Promise<IdentityFloor> =>
			client.marketplace.identityFloor(length),
	});
}
