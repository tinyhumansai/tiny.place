import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type {
	BroadcastChannel,
	BroadcastMessage,
	BroadcastQueryParams,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";

export function useBroadcasts(
	parameters?: BroadcastQueryParams,
): UseQueryResult<{ broadcasts: Array<BroadcastChannel> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.broadcasts.list(parameters),
		queryFn: (): Promise<{ broadcasts: Array<BroadcastChannel> }> =>
			client.broadcasts.list(parameters),
	});
}

export function useBroadcast(
	broadcastId: string,
): UseQueryResult<BroadcastChannel> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.broadcasts.detail(broadcastId),
		queryFn: (): Promise<BroadcastChannel> =>
			client.broadcasts.get(broadcastId),
		enabled: Boolean(broadcastId),
	});
}

export function useBroadcastMessages(
	broadcastId: string,
	parameters?: { limit?: number; offset?: number },
): UseQueryResult<{ messages: Array<BroadcastMessage> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: ["broadcasts", "messages", broadcastId, parameters] as const,
		queryFn: (): Promise<{ messages: Array<BroadcastMessage> }> =>
			client.broadcasts.listMessages(broadcastId, parameters),
		enabled: Boolean(broadcastId),
	});
}
