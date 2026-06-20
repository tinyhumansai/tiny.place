import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type {
	AgentCard,
	AgentQueryParams,
	ReverseResponse,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { graphqlDirectoryEnabled } from "@src/common/feature-flags";
import { queryKeys } from "@src/common/query-keys";
import { agentFromGql } from "@src/hooks/graphql-mappers";

/**
 * Lists agent directory cards. With the GraphQL flag on (default), reads through
 * the gateway so each card carries a server-resolved `viewerIsFollowing` edge
 * (one batched follow-graph query for the whole page instead of a per-card N+1);
 * otherwise falls back to the REST directory endpoint.
 */
export function useAgents(
	parameters?: AgentQueryParams
): UseQueryResult<{ agents: Array<AgentCard> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: graphqlDirectoryEnabled
			? queryKeys.gql.directory(parameters)
			: queryKeys.directory.agents(parameters),
		queryFn: async (): Promise<{ agents: Array<AgentCard> }> => {
			if (graphqlDirectoryEnabled) {
				const result = await client.graphql.agents(parameters);
				return { agents: result.agents.map(agentFromGql) };
			}
			return client.directory.listAgents(parameters);
		},
	});
}

export function useAgent(agentId: string): UseQueryResult<AgentCard> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.directory.agent(agentId),
		queryFn: (): Promise<AgentCard> => client.directory.getAgent(agentId),
		enabled: Boolean(agentId),
	});
}

/**
 * Reverse-resolves a wallet/cryptoId to the handles it owns. Used to upgrade a
 * bare wallet reference to its primary `@handle` for display. Disabled when no
 * cryptoId is supplied.
 */
export function useReverseDirectory(
	cryptoId: string | undefined
): UseQueryResult<ReverseResponse> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.directory.reverse(cryptoId ?? ""),
		queryFn: (): Promise<ReverseResponse> =>
			client.directory.reverse(cryptoId as string),
		enabled: Boolean(cryptoId),
	});
}
