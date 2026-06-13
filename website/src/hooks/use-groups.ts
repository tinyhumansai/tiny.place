import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import type {
	GroupCreateRequest,
	GroupMember,
	GroupMetadata,
	GroupQueryParams,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";

export function useGroups(
	parameters?: GroupQueryParams
): UseQueryResult<{ groups: Array<GroupMetadata> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.groups.list(parameters),
		queryFn: (): Promise<{ groups: Array<GroupMetadata> }> =>
			client.groups.list(parameters),
	});
}

export function useGroup(groupId: string): UseQueryResult<GroupMetadata> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.groups.detail(groupId),
		queryFn: (): Promise<GroupMetadata> => client.groups.get(groupId),
		enabled: Boolean(groupId),
	});
}

export function useGroupMembers(
	groupId: string
): UseQueryResult<{ members: Array<GroupMember> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.groups.members(groupId),
		queryFn: (): Promise<{ members: Array<GroupMember> }> =>
			client.groups.members(groupId),
		enabled: Boolean(groupId),
	});
}

export function useCreateGroup(): UseMutationResult<
	GroupMetadata,
	Error,
	GroupCreateRequest
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (request): Promise<GroupMetadata> =>
			client.groups.create(request),
		onSuccess: (group): void => {
			void queryClient.invalidateQueries({ queryKey: ["groups", "list"] });
			void queryClient.invalidateQueries({
				queryKey: queryKeys.groups.detail(group.groupId),
			});
		},
	});
}

export function useJoinGroup(): UseMutationResult<
	GroupMember,
	Error,
	{ agentId: string; groupId: string; paymentAuthorization?: string }
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			agentId,
			groupId,
			paymentAuthorization,
		}): Promise<GroupMember> =>
			client.groups.join(groupId, { agentId, paymentAuthorization }),
		onSuccess: (member): void => {
			void queryClient.invalidateQueries({ queryKey: ["groups", "list"] });
			void queryClient.invalidateQueries({
				queryKey: queryKeys.groups.detail(member.groupId),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.groups.members(member.groupId),
			});
		},
	});
}
