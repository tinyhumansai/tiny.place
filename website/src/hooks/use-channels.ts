import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import type {
	Channel,
	ChannelCategory,
	ChannelMember,
	ChannelMessage,
	ChannelQueryParams,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";

export function useChannels(
	parameters?: ChannelQueryParams
): UseQueryResult<{ channels: Array<Channel> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.channels.list(parameters),
		queryFn: (): Promise<{ channels: Array<Channel> }> =>
			client.channels.list(parameters),
	});
}

export function useChannel(channelId: string): UseQueryResult<Channel> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.channels.detail(channelId),
		queryFn: (): Promise<Channel> => client.channels.get(channelId),
		enabled: Boolean(channelId),
	});
}

export function useChannelMessages(
	channelId: string,
	parameters?: { limit?: number; offset?: number }
): UseQueryResult<{ messages: Array<ChannelMessage> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.channels.messages(channelId),
		queryFn: (): Promise<{ messages: Array<ChannelMessage> }> =>
			client.channels.listMessages(channelId, parameters),
		enabled: Boolean(channelId),
	});
}

export function useTrendingChannels(
	limit?: number
): UseQueryResult<{ channels: Array<Channel> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.channels.trending(),
		queryFn: (): Promise<{ channels: Array<Channel> }> =>
			client.channels.trending(limit),
	});
}

export function useChannelCategories(): UseQueryResult<{
	categories: Array<ChannelCategory>;
}> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.channels.categories(),
		queryFn: (): Promise<{ categories: Array<ChannelCategory> }> =>
			client.channels.categories(),
	});
}

export function usePostChannelMessage(
	channelId: string
): UseMutationResult<
	ChannelMessage,
	Error,
	{ actor: string; attachments?: Array<string>; text: string }
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: {
			actor: string;
			text: string;
			attachments?: Array<string>;
		}): Promise<ChannelMessage> =>
			client.channels.postMessage(channelId, {
				author: body.actor,
				attachments: body.attachments,
				body: body.text,
			}),
		onSuccess: (): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.channels.messages(channelId),
			});
		},
	});
}

export function useJoinChannel(): UseMutationResult<
	ChannelMember,
	Error,
	{ agentId: string; channelId: string }
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ agentId, channelId }): Promise<ChannelMember> =>
			client.channels.join(channelId, agentId),
		onSuccess: (member): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.channels.list(),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.channels.detail(member.channelId),
			});
		},
	});
}

export function useDeleteChannelMessage(
	channelId: string
): UseMutationResult<void, Error, string> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (messageId: string): Promise<void> =>
			client.channels.deleteMessage(channelId, messageId),
		onSuccess: (): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.channels.messages(channelId),
			});
		},
	});
}
