import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import type {
	FeedbackCreate,
	FeedbackItem,
	FeedbackListParams,
	FeedbackStatusUpdate,
	FeedbackVoteRequest,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";
import { useAuthStore } from "@src/store/auth";

export function useFeedback(
	parameters?: FeedbackListParams
): UseQueryResult<{ feedback: Array<FeedbackItem> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.feedback.list(parameters),
		queryFn: async (): Promise<{ feedback: Array<FeedbackItem> }> => {
			const result = await client.feedback.list(parameters);
			return { feedback: result.feedback ?? [] };
		},
	});
}

export function useAdminFeedback(
	parameters?: FeedbackListParams,
	options?: { enabled?: boolean }
): UseQueryResult<{ feedback: Array<FeedbackItem> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.feedback.adminList(parameters),
		queryFn: async (): Promise<{ feedback: Array<FeedbackItem> }> => {
			const result = await client.feedback.listAdmin(parameters);
			return { feedback: result.feedback ?? [] };
		},
		enabled: options?.enabled ?? true,
		retry: false,
	});
}

export function useCreateFeedback(): UseMutationResult<
	FeedbackItem,
	Error,
	Omit<FeedbackCreate, "author"> & { author?: string }
> {
	const client = useApiClient();
	const agentId = useAuthStore((state) => state.agentId);
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (feedback): Promise<FeedbackItem> => {
			if (!agentId) {
				throw new Error("Connect your wallet first");
			}
			return client.feedback.create({
				...feedback,
				author: feedback.author ?? agentId,
			});
		},
		onSuccess: (): void => {
			void queryClient.invalidateQueries({ queryKey: ["feedback"] });
		},
	});
}

export function useVoteFeedback(): UseMutationResult<
	FeedbackItem,
	Error,
	{ feedbackId: string; vote: FeedbackVoteRequest["vote"] }
> {
	const client = useApiClient();
	const agentId = useAuthStore((state) => state.agentId);
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ feedbackId, vote }): Promise<FeedbackItem> => {
			if (!agentId) {
				throw new Error("Connect your wallet first");
			}
			return client.feedback.vote(feedbackId, { voter: agentId, vote });
		},
		onSuccess: (feedback): void => {
			void queryClient.invalidateQueries({ queryKey: ["feedback"] });
			void queryClient.invalidateQueries({
				queryKey: queryKeys.feedback.detail(feedback.feedbackId),
			});
		},
	});
}

export function useUpdateFeedbackStatus(): UseMutationResult<
	FeedbackItem,
	Error,
	{ feedbackId: string; update: FeedbackStatusUpdate }
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ feedbackId, update }): Promise<FeedbackItem> =>
			client.feedback.updateStatus(feedbackId, update),
		onSuccess: (): void => {
			void queryClient.invalidateQueries({ queryKey: ["feedback"] });
			void queryClient.invalidateQueries({ queryKey: queryKeys.admin.audit() });
		},
	});
}
