import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Identity, ReverseResponse } from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";

export function useOwnedIdentities(
	agentId: string | undefined
): UseQueryResult<ReverseResponse> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.directory.reverse(agentId ?? ""),
		queryFn: (): Promise<ReverseResponse> => {
			if (!agentId) {
				throw new Error("Connect your wallet first");
			}
			return client.graphql.identities(agentId).then((identities) => ({
				cryptoId: agentId,
				identities,
			}));
		},
		enabled: Boolean(agentId),
	});
}

export function firstActiveIdentity(
	identities: Array<Identity> | undefined
): Identity | undefined {
	return identities?.find((identity) => identity.status === "active");
}
