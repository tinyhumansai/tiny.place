import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import type {
	Attestation,
	AttestationCreate,
	LeaderboardCategory,
	LeaderboardQueryParams,
	LeaderboardResponse,
	ReputationHistoryPoint,
	ReputationReview,
	ReputationScore,
	TrustGraph,
	TwitterChallengeRequest,
	TwitterChallengeResult,
	TwitterVerificationStatus,
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

export function useRequestTwitterChallenge(): UseMutationResult<
	TwitterChallengeResult,
	Error,
	TwitterChallengeRequest
> {
	const client = useApiClient();
	return useMutation({
		mutationFn: (
			request: TwitterChallengeRequest
		): Promise<TwitterChallengeResult> =>
			client.reputation.requestTwitterChallenge(request),
	});
}

export function useSubmitTwitterAttestation(): UseMutationResult<
	Attestation,
	Error,
	AttestationCreate
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (attestation: AttestationCreate): Promise<Attestation> =>
			client.reputation.submitTwitterAttestation(attestation),
		onSuccess: (attestation): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.reputation.attestations(attestation.agentCryptoId),
			});
		},
	});
}

/**
 * Polls the async verification status of a submitted Twitter/X attestation.
 * Pass `enabled` to start polling once an attestation has been submitted; it
 * stops refetching automatically once a terminal (verified/failed) status is
 * reached.
 */
export function useTwitterVerificationStatus(
	attestationId: string | undefined,
	enabled: boolean
): UseQueryResult<TwitterVerificationStatus> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.reputation.twitterStatus(attestationId ?? ""),
		queryFn: (): Promise<TwitterVerificationStatus> =>
			client.reputation.getTwitterVerificationStatus(attestationId ?? ""),
		enabled: enabled && Boolean(attestationId),
		refetchInterval: (query): number | false => {
			const status = query.state.data?.status;
			return status === "verified" || status === "failed" ? false : 3000;
		},
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
				case "games":
					return client.reputation.gamesLeaderboard(parameters);
				case "volume":
					return client.reputation.volumeLeaderboard(parameters);
				default:
					return client.reputation.leaderboard(category, parameters);
			}
		},
	});
}
