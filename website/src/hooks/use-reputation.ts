import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type {
	LeaderboardResponse,
	ReputationReview,
	ReputationScore,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";

export function useReputationScore(
	agentId: string,
): UseQueryResult<ReputationScore> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.reputation.score(agentId),
		queryFn: (): Promise<ReputationScore> =>
			client.reputation.getScore(agentId),
		enabled: Boolean(agentId),
	});
}

export function useReputationReviews(
	agentId: string,
): UseQueryResult<{ reviews: Array<ReputationReview> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.reputation.reviews(agentId),
		queryFn: (): Promise<{ reviews: Array<ReputationReview> }> =>
			client.reputation.getReviews(agentId),
		enabled: Boolean(agentId),
	});
}

export function useLeaderboard(
	category?: string,
	parameters?: { limit?: number; period?: string; sort?: string },
): UseQueryResult<LeaderboardResponse> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.reputation.leaderboard(category),
		queryFn: (): Promise<LeaderboardResponse> =>
			client.reputation.leaderboard(category, parameters),
	});
}
