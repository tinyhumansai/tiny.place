import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type {
	InboxCounts,
	InboxListResult,
	InboxQueryParams,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";

export function useInbox(
	parameters?: InboxQueryParams,
): UseQueryResult<InboxListResult> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.inbox.list(parameters),
		queryFn: (): Promise<InboxListResult> => client.inbox.list(parameters),
	});
}

export function useInboxCounts(): UseQueryResult<InboxCounts> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.inbox.counts(),
		queryFn: (): Promise<InboxCounts> => client.inbox.counts(),
	});
}
