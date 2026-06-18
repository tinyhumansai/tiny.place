import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import type {
	Comment,
	FeedQueryParams,
	HomeFeedParams,
	HomeFeedResult,
	LikeResult,
	Post,
	PostListResult,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";

export function useUserFeed(
	handle: string,
	parameters?: FeedQueryParams,
	viewer?: string
): UseQueryResult<PostListResult> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.feeds.user(handle, parameters, viewer),
		queryFn: (): Promise<PostListResult> =>
			client.feeds.listPosts(handle, parameters, viewer || undefined),
		enabled: Boolean(handle),
	});
}

export function useHomeFeed(
	parameters?: HomeFeedParams,
	enabled = true
): UseQueryResult<HomeFeedResult> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.feeds.home(parameters),
		queryFn: (): Promise<HomeFeedResult> => client.feeds.homeFeed(parameters),
		enabled,
	});
}

export function usePostComments(
	handle: string,
	postId: string,
	enabled: boolean
): UseQueryResult<{ comments: Array<Comment> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.feeds.comments(handle, postId),
		queryFn: (): Promise<{ comments: Array<Comment> }> =>
			client.feeds.listComments(handle, postId),
		enabled: enabled && Boolean(handle) && Boolean(postId),
	});
}

export function useCreatePost(
	handle: string
): UseMutationResult<Post, Error, { body: string }> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { body: string }): Promise<Post> =>
			client.feeds.createPost(handle, { body: input.body }),
		onSuccess: (): void => {
			void queryClient.invalidateQueries({
				queryKey: ["feeds", "user", handle],
			});
			void queryClient.invalidateQueries({ queryKey: ["feeds", "home"] });
		},
	});
}

export function useDeletePost(
	handle: string
): UseMutationResult<void, Error, string> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (postId: string): Promise<void> =>
			client.feeds.deletePost(handle, postId),
		onSuccess: (): void => {
			void queryClient.invalidateQueries({
				queryKey: ["feeds", "user", handle],
			});
			void queryClient.invalidateQueries({ queryKey: ["feeds", "home"] });
		},
	});
}

export function useAddComment(
	handle: string,
	postId: string
): UseMutationResult<Comment, Error, { actor: string; body: string }> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { actor: string; body: string }): Promise<Comment> =>
			client.feeds.addComment(handle, postId, input.actor, {
				body: input.body,
			}),
		onSuccess: (): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.feeds.comments(handle, postId),
			});
			void queryClient.invalidateQueries({
				queryKey: ["feeds", "user", handle],
			});
		},
	});
}

export function useLikePost(
	handle: string
): UseMutationResult<LikeResult, Error, { postId: string; actor: string }> {
	const client = useApiClient();
	return useMutation({
		mutationFn: (input: {
			postId: string;
			actor: string;
		}): Promise<LikeResult> =>
			client.feeds.likePost(handle, input.postId, input.actor),
	});
}

export function useUnlikePost(
	handle: string
): UseMutationResult<LikeResult, Error, { postId: string; actor: string }> {
	const client = useApiClient();
	return useMutation({
		mutationFn: (input: {
			postId: string;
			actor: string;
		}): Promise<LikeResult> =>
			client.feeds.unlikePost(handle, input.postId, input.actor),
	});
}

export function useDeleteComment(
	handle: string,
	postId: string
): UseMutationResult<void, Error, { actor: string; commentId: string }> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { actor: string; commentId: string }): Promise<void> =>
			client.feeds.deleteComment(handle, postId, input.commentId, input.actor),
		onSuccess: (): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.feeds.comments(handle, postId),
			});
		},
	});
}
