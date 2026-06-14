import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import {
	signX402Authorization,
	TinyPlaceError,
	type BroadcastChannel,
	type BroadcastCreateRequest,
	type BroadcastMessage,
	type BroadcastQueryParams,
	type BroadcastSubscriber,
	type BroadcastSubscribeRequest,
	type X402AuthorizationFields,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";
import { useAuthStore } from "@src/store/auth";

type BroadcastPaymentChallenge = {
	error: string;
	payment: Omit<X402AuthorizationFields, "expiresAt" | "nonce"> &
		Partial<Pick<X402AuthorizationFields, "expiresAt" | "nonce">>;
};

function broadcastPaymentChallenge(
	error: unknown
): BroadcastPaymentChallenge | null {
	if (!(error instanceof TinyPlaceError) || error.status !== 402) {
		return null;
	}
	if (!error.body || typeof error.body !== "object") {
		return null;
	}
	const body = error.body as Partial<BroadcastPaymentChallenge>;
	if (!body.payment || typeof body.payment !== "object") {
		return null;
	}
	return {
		error: body.error ?? "Payment required",
		payment: body.payment,
	};
}

export function useBroadcasts(
	parameters?: BroadcastQueryParams
): UseQueryResult<{ broadcasts: Array<BroadcastChannel> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.broadcasts.list(parameters),
		queryFn: (): Promise<{ broadcasts: Array<BroadcastChannel> }> =>
			client.broadcasts.list(parameters),
	});
}

export function useBroadcast(
	broadcastId: string
): UseQueryResult<BroadcastChannel> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.broadcasts.detail(broadcastId),
		queryFn: (): Promise<BroadcastChannel> =>
			client.broadcasts.get(broadcastId),
		enabled: Boolean(broadcastId),
	});
}

export function useBroadcastMessages(
	broadcastId: string,
	parameters?: {
		agentId?: string;
		limit?: number;
		offset?: number;
		paymentAuthorization?: string;
	}
): UseQueryResult<{ messages: Array<BroadcastMessage> }> {
	const client = useApiClient();
	const signer = useAuthStore((state) => state.signer);
	return useQuery({
		queryKey: queryKeys.broadcasts.messages(broadcastId, parameters),
		queryFn: async (): Promise<{ messages: Array<BroadcastMessage> }> => {
			try {
				return await client.broadcasts.listMessages(broadcastId, parameters);
			} catch (error) {
				const challenge = broadcastPaymentChallenge(error);
				if (!challenge) {
					throw error;
				}
				if (!signer) {
					throw new Error("Connect your wallet first");
				}
				const challengePayment = challenge.payment;
				const signedPayment = await signX402Authorization(signer, {
					...challengePayment,
					expiresAt: challengePayment.expiresAt ?? "",
					from: challengePayment.from || parameters?.agentId || "",
					metadata: challengePayment.metadata,
					nonce: challengePayment.nonce ?? "",
				});
				return client.broadcasts.listMessages(broadcastId, {
					...parameters,
					paymentAuthorization: signedPayment.signature,
				});
			}
		},
		enabled: Boolean(broadcastId),
	});
}

export function useCreateBroadcast(): UseMutationResult<
	BroadcastChannel,
	Error,
	BroadcastCreateRequest
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (request): Promise<BroadcastChannel> =>
			client.broadcasts.create(request),
		onSuccess: (broadcast): void => {
			void queryClient.invalidateQueries({
				queryKey: ["broadcasts", "list"],
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.broadcasts.detail(broadcast.broadcastId),
			});
		},
	});
}

export function useSubscribeBroadcast(): UseMutationResult<
	BroadcastSubscriber,
	Error,
	{ broadcastId: string } & BroadcastSubscribeRequest
> {
	const client = useApiClient();
	const signer = useAuthStore((state) => state.signer);
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			broadcastId,
			...request
		}): Promise<BroadcastSubscriber> => {
			try {
				return await client.broadcasts.subscribe(broadcastId, request);
			} catch (error) {
				const challenge = broadcastPaymentChallenge(error);
				if (!challenge) {
					throw error;
				}
				if (!signer) {
					throw new Error("Connect your wallet first");
				}
				const challengePayment = challenge.payment;
				const signedPayment = await signX402Authorization(signer, {
					...challengePayment,
					expiresAt: challengePayment.expiresAt ?? "",
					from: challengePayment.from || request.agentId || "",
					metadata: challengePayment.metadata,
					nonce: challengePayment.nonce ?? "",
				});
				return client.broadcasts.subscribe(broadcastId, {
					...request,
					paymentAuthorization: signedPayment.signature,
					paymentExpiresAt: signedPayment.expiresAt || undefined,
				});
			}
		},
		onSuccess: (subscription): void => {
			void queryClient.invalidateQueries({
				queryKey: ["broadcasts", "list"],
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.broadcasts.detail(subscription.broadcastId),
			});
		},
	});
}

export function usePostBroadcastMessage(): UseMutationResult<
	BroadcastMessage,
	Error,
	{
		body: string;
		broadcastId: string;
		contentType?: string;
		publisher: string;
	}
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			body,
			broadcastId,
			contentType,
			publisher,
		}): Promise<BroadcastMessage> =>
			client.broadcasts.postMessage(broadcastId, {
				body,
				contentType: contentType ?? "text/plain",
				publisher,
			}),
		onSuccess: (message): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.broadcasts.messages(message.broadcastId),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.broadcasts.detail(message.broadcastId),
			});
		},
	});
}
