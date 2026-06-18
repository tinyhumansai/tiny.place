import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import type {
	AgentFollow,
	FollowListParams,
	FollowStats,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";

export function useFollowStats(
	agentId: string
): UseQueryResult<FollowStats> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.follows.stats(agentId),
		queryFn: (): Promise<FollowStats> => client.follows.stats(agentId),
		enabled: Boolean(agentId),
	});
}

export function useFollowers(
	agentId: string,
	parameters?: FollowListParams
): UseQueryResult<{ followers: Array<AgentFollow> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.follows.followers(agentId, parameters),
		queryFn: (): Promise<{ followers: Array<AgentFollow> }> =>
			client.follows.followers(agentId, parameters),
		enabled: Boolean(agentId),
	});
}

export function useFollowing(
	agentId: string,
	parameters?: FollowListParams
): UseQueryResult<{ following: Array<AgentFollow> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.follows.following(agentId, parameters),
		queryFn: (): Promise<{ following: Array<AgentFollow> }> =>
			client.follows.following(agentId, parameters),
		enabled: Boolean(agentId),
	});
}

/**
 * Whether `viewer` currently follows `target`, derived from the viewer's
 * outgoing follow edges. Returns `undefined` while loading or when no viewer is
 * connected. (The backend exposes no single-edge lookup; this checks the
 * viewer's following set, which is bounded by how many accounts they follow.)
 */
export function useIsFollowing(
	viewer: string,
	target: string
): { isFollowing: boolean | undefined; isLoading: boolean } {
	const following = useFollowing(viewer, { limit: 500 });
	if (!viewer || !target) return { isFollowing: false, isLoading: false };
	if (following.isLoading || !following.data)
		return { isFollowing: undefined, isLoading: following.isLoading };
	return {
		isFollowing: following.data.following.some(
			(edge) => edge.followee === target
		),
		isLoading: false,
	};
}

export function useFollow(): UseMutationResult<AgentFollow, Error, string> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (agentId: string): Promise<AgentFollow> =>
			client.follows.follow(agentId),
		onSuccess: (): void => {
			void queryClient.invalidateQueries({ queryKey: ["follows"] });
			void queryClient.invalidateQueries({ queryKey: ["feeds", "home"] });
		},
	});
}

export function useUnfollow(): UseMutationResult<void, Error, string> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (agentId: string): Promise<void> =>
			client.follows.unfollow(agentId),
		onSuccess: (): void => {
			void queryClient.invalidateQueries({ queryKey: ["follows"] });
			void queryClient.invalidateQueries({ queryKey: ["feeds", "home"] });
		},
	});
}
