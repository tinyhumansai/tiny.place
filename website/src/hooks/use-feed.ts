import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
	type InfiniteData,
	type UseInfiniteQueryResult,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import type {
	Comment,
	FeedQueryParams,
	GqlComment,
	GqlHomeFeedItem,
	GqlHomeFeedResult,
	HomeFeedParams,
	HomeFeedResult,
	LikeResult,
	Post,
	PostListResult,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { DEFAULT_PAGE_SIZE, getNextOffset } from "@src/common/infinite";
import { queryKeys } from "@src/common/query-keys";
import { useEffectiveActor } from "@src/components/feed/use-actor";
import { commentFromGql, postFromGql } from "@src/hooks/graphql-mappers";

export function useUserFeed(
	handle: string,
	parameters?: FeedQueryParams,
	viewer?: string
): UseQueryResult<PostListResult> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.feeds.user(handle, parameters, viewer),
		queryFn: async (): Promise<PostListResult> => {
			const result = await client.graphql.posts(handle, {
				limit: parameters?.limit,
				before: parameters?.before,
				viewer: viewer || undefined,
			});
			return { posts: result.posts.map(postFromGql) };
		},
		enabled: Boolean(handle),
	});
}

export function useHomeFeed(
	parameters?: HomeFeedParams,
	enabled = true
): UseQueryResult<HomeFeedResult> {
	const client = useApiClient();
	// Scope the cache by the connected viewer ("" when anonymous) so the public
	// and personalized feeds never collide and connecting a wallet refetches.
	const viewer = useEffectiveActor();
	return useQuery({
		queryKey: queryKeys.feeds.home(parameters, viewer),
		queryFn: (): Promise<HomeFeedResult> => client.feeds.homeFeed(parameters),
		enabled,
	});
}

export function usePost(
	handle: string,
	postId: string,
	viewer?: string
): UseQueryResult<Post> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.feeds.post(handle, postId, viewer),
		queryFn: async (): Promise<Post> => {
			const post = await client.graphql.post(handle, postId, {
				viewer: viewer || undefined,
				commentLimit: 20,
				likerLimit: 20,
			});
			if (!post) {
				throw new Error("Post not found");
			}
			return postFromGql(post);
		},
		enabled: Boolean(handle) && Boolean(postId),
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
		queryFn: async (): Promise<{ comments: Array<Comment> }> => ({
			comments: (await client.graphql.postComments(postId)).map(commentFromGql),
		}),
		enabled: enabled && Boolean(handle) && Boolean(postId),
	});
}

/**
 * GraphQL-gateway home feed: one batched request returns posts with their
 * author + verified status embedded, so the feed no longer fans out one
 * profile + one attestations fetch per author (the 429 source).
 */
export function useHomeFeedGql(
	parameters?: HomeFeedParams,
	enabled = true
): UseQueryResult<GqlHomeFeedResult> {
	const client = useApiClient();
	const viewer = useEffectiveActor();
	return useQuery({
		queryKey: queryKeys.gql.home(parameters, viewer),
		queryFn: (): Promise<GqlHomeFeedResult> =>
			client.graphql.homeFeed(parameters),
		enabled,
	});
}

/**
 * Paginated variant of {@link useHomeFeedGql}. Each page pulls the next
 * `DEFAULT_PAGE_SIZE` ranked items via the gateway's limit/offset paging, so the
 * timeline grows on demand instead of fetching one large slab up front. Pages are
 * flattened by the caller (see `flattenPages`).
 */
export function useHomeFeedGqlInfinite(
	enabled = true
): UseInfiniteQueryResult<InfiniteData<Array<GqlHomeFeedItem>>, Error> {
	const client = useApiClient();
	const viewer = useEffectiveActor();
	return useInfiniteQuery({
		queryKey: queryKeys.gql.homeInfinite(viewer),
		initialPageParam: 0,
		queryFn: async ({ pageParam }): Promise<Array<GqlHomeFeedItem>> =>
			(
				await client.graphql.homeFeed({
					includeSelf: true,
					limit: DEFAULT_PAGE_SIZE,
					offset: pageParam,
				})
			).items,
		getNextPageParam: (lastPage, allPages): number | undefined =>
			getNextOffset(lastPage, allPages),
		enabled,
	});
}

/**
 * GraphQL-gateway comments: authors (and their verified status) arrive embedded,
 * so the comment list issues a single request instead of one attestations fetch
 * per commenter.
 */
export function usePostCommentsGql(
	postId: string,
	enabled: boolean
): UseQueryResult<{ comments: Array<GqlComment> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.gql.comments(postId),
		queryFn: async (): Promise<{ comments: Array<GqlComment> }> => ({
			comments: await client.graphql.postComments(postId),
		}),
		enabled: enabled && Boolean(postId),
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
			void queryClient.invalidateQueries({ queryKey: ["gql", "home-feed"] });
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
			void queryClient.invalidateQueries({ queryKey: ["gql", "home-feed"] });
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
				queryKey: queryKeys.gql.comments(postId),
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
			void queryClient.invalidateQueries({
				queryKey: queryKeys.gql.comments(postId),
			});
		},
	});
}
