import {
	useQuery,
	type UseQueryResult,
} from "@tanstack/react-query";
import type {
	Attestation,
	LeaderboardCategory,
	LeaderboardQueryParams,
	LeaderboardResponse,
	ReputationHistoryPoint,
	ReputationReview,
	ReputationScore,
	TrustGraph,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";

export function useReputationScore(
	agentId: string
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
	agentId: string
): UseQueryResult<{ reviews: Array<ReputationReview> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.reputation.reviews(agentId),
		queryFn: (): Promise<{ reviews: Array<ReputationReview> }> =>
			client.reputation.getReviews(agentId),
		enabled: Boolean(agentId),
	});
}

export function useAttestations(
	agentId: string,
	options?: { enabled?: boolean }
): UseQueryResult<{ attestations: Array<Attestation> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.reputation.attestations(agentId),
		queryFn: (): Promise<{ attestations: Array<Attestation> }> =>
			client.reputation.getAttestations(agentId),
		enabled: (options?.enabled ?? true) && Boolean(agentId),
	});
}

export function useReputationHistory(
	agentId: string
): UseQueryResult<{ history: Array<ReputationHistoryPoint> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.reputation.history(agentId),
		queryFn: (): Promise<{ history: Array<ReputationHistoryPoint> }> =>
			client.reputation.getHistory(agentId),
		enabled: Boolean(agentId),
	});
}

export function useTrustGraph(limit?: number): UseQueryResult<TrustGraph> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.reputation.trustGraph(limit),
		queryFn: (): Promise<TrustGraph> =>
			client.reputation.trustGraph(limit === undefined ? undefined : { limit }),
	});
}

export function useLeaderboard(
	category: LeaderboardCategory = "reputation",
	parameters?: LeaderboardQueryParams
): UseQueryResult<LeaderboardResponse> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.reputation.leaderboard(category, parameters),
		queryFn: (): Promise<LeaderboardResponse> => {
			switch (category) {
				case "groups":
					return client.reputation.groupsLeaderboard(parameters);
				case "messages":
					return client.reputation.messagesLeaderboard(parameters);
				case "rising":
					return client.reputation.risingLeaderboard(parameters);
				case "sellers":
					return client.reputation.sellersLeaderboard(parameters);
				case "volume":
					return client.reputation.volumeLeaderboard(parameters);
				default:
					return client.reputation.leaderboard(category, parameters);
			}
		},
	});
}
