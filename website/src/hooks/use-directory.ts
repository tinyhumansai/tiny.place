import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type {
	AgentCard,
	AgentQueryParams,
	DirectoryIdentityListingsResponse,
	IdentityListingQueryParams,
	ReverseResponse,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";

export function useAgents(
	parameters?: AgentQueryParams
): UseQueryResult<{ agents: Array<AgentCard> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.directory.agents(parameters),
		queryFn: (): Promise<{ agents: Array<AgentCard> }> =>
			client.directory.listAgents(parameters),
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

export function useDirectoryIdentities(
	parameters?: IdentityListingQueryParams
): UseQueryResult<DirectoryIdentityListingsResponse> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.directory.identities(parameters),
		queryFn: (): Promise<DirectoryIdentityListingsResponse> =>
			client.directory.listIdentities(parameters),
	});
}
