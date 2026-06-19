import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import type {
	InboxCounts,
	InboxListResult,
	InboxMarkResult,
	InboxQueryParams,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";

function useInboxMutation<TResult, TVariables extends { owner?: string }>(
	mutationFn: (variables: TVariables) => Promise<TResult>
): UseMutationResult<TResult, Error, TVariables> {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn,
		onSuccess: (_result, variables): void => {
			void queryClient.invalidateQueries({
				queryKey: ["inbox", "list"],
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.inbox.counts(variables.owner),
			});
		},
	});
}

export function useInbox(
	parameters?: InboxQueryParams,
	owner?: string
): UseQueryResult<InboxListResult> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.inbox.list(parameters, owner),
		queryFn: (): Promise<InboxListResult> =>
			client.inbox.list(parameters, owner),
		// Don't fetch until a session owner is known — otherwise the request signs
		// with no key and throws a non-401 client error that surfaces as a
		// misleading "Failed to load inbox" instead of a connect prompt.
		enabled: Boolean(owner),
	});
}

export function useInboxCounts(owner?: string): UseQueryResult<InboxCounts> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.inbox.counts(owner),
		queryFn: (): Promise<InboxCounts> => client.inbox.counts(owner),
		enabled: Boolean(owner),
	});
}

export function useMarkInboxRead(): UseMutationResult<
	InboxMarkResult,
	Error,
	{ itemId: string; owner?: string }
> {
	const client = useApiClient();
	return useInboxMutation(
		({ itemId, owner }): Promise<InboxMarkResult> =>
			client.inbox.markRead(itemId, owner)
	);
}

export function useArchiveInboxItem(): UseMutationResult<
	InboxMarkResult,
	Error,
	{ itemId: string; owner?: string }
> {
	const client = useApiClient();
	return useInboxMutation(
		({ itemId, owner }): Promise<InboxMarkResult> =>
			client.inbox.archive(itemId, owner)
	);
}

export function useDeleteInboxItem(): UseMutationResult<
	void,
	Error,
	{ itemId: string; owner?: string }
> {
	const client = useApiClient();
	return useInboxMutation(
		({ itemId, owner }): Promise<void> => client.inbox.remove(itemId, owner)
	);
}

export function useMarkAllInboxRead(): UseMutationResult<
	{ updated: number },
	Error,
	{ owner?: string }
> {
	const client = useApiClient();
	return useInboxMutation(
		({ owner }): Promise<{ updated: number }> =>
			client.inbox.markAllRead(undefined, owner)
	);
}
