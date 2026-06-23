import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import {
	generateNonce,
	type Subscription,
	type SubscriptionCreateRequest,
	type SubscriptionRenewRequest,
	type SubscriptionRenewResponse,
	type SupportedChain,
	type X402SettleRequest,
	type X402SettleResponse,
	type X402VerifyRequest,
	type X402VerifyResponse,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { signX402ChallengeAuthorization } from "@src/common/auth-payment";
import { queryKeys } from "@src/common/query-keys";
import { useAuthStore } from "@src/store/auth";

import { buildSubscriptionAuthorizationFields } from "./subscription-authorization";

function subscriptionId(): string {
	return `sub_${generateNonce().replace(/_/g, "")}`;
}

export function useSupportedPayments(): UseQueryResult<{
	chains: Array<SupportedChain>;
}> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.payments.supported(),
		queryFn: (): Promise<{ chains: Array<SupportedChain> }> =>
			client.payments.supported(),
	});
}

export function useVerifyPayment(): UseMutationResult<
	X402VerifyResponse,
	Error,
	X402VerifyRequest
> {
	const client = useApiClient();
	return useMutation({
		mutationFn: (request): Promise<X402VerifyResponse> =>
			client.payments.verify(request),
	});
}

export function useSettlePayment(): UseMutationResult<
	X402SettleResponse,
	Error,
	X402SettleRequest
> {
	const client = useApiClient();
	return useMutation({
		mutationFn: (request): Promise<X402SettleResponse> =>
			client.payments.settle(request),
	});
}

export function useSubscription(
	subscriptionId: string | undefined
): UseQueryResult<Subscription> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.payments.subscription(subscriptionId ?? ""),
		queryFn: (): Promise<Subscription> =>
			client.payments.getSubscription(subscriptionId ?? ""),
		enabled: Boolean(subscriptionId),
	});
}

export function useCreateSubscription(): UseMutationResult<
	Subscription,
	Error,
	SubscriptionCreateRequest
> {
	const client = useApiClient();
	const signer = useAuthStore((state) => state.signer);
	const agentId = useAuthStore((state) => state.agentId);
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (request): Promise<Subscription> => {
			const nextSubscriptionId = request.subscriptionId ?? subscriptionId();
			const subscriber = request.subscriber || agentId;
			if (!subscriber) {
				throw new Error("Subscriber is required");
			}
			if (!request.authorization?.signature) {
				if (!signer) {
					throw new Error("Connect your wallet first");
				}
				const authorization = await signX402ChallengeAuthorization({
					fallbackFrom: subscriber,
					noncePrefix: "sub",
					payment: buildSubscriptionAuthorizationFields({
						subscriptionId: nextSubscriptionId,
						plan: request.plan,
						from: subscriber,
						to: request.provider,
					}),
					signer,
				});
				return client.payments.createSubscription({
					...request,
					subscriptionId: nextSubscriptionId,
					subscriber,
					authorization: {
						...request.authorization,
						scheme: "exact",
						signature: authorization.signature,
					},
				});
			}
			return client.payments.createSubscription({
				...request,
				subscriptionId: nextSubscriptionId,
				subscriber,
			});
		},
		onSuccess: (subscription): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.payments.subscription(subscription.subscriptionId),
			});
		},
	});
}

export function useRenewSubscription(): UseMutationResult<
	SubscriptionRenewResponse,
	Error,
	{ subscriptionId: string; request?: Partial<SubscriptionRenewRequest> }
> {
	const client = useApiClient();
	const signer = useAuthStore((state) => state.signer);
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			subscriptionId: id,
			request,
		}): Promise<SubscriptionRenewResponse> => {
			if (request?.paymentAuthorization) {
				return client.payments.renewSubscription(id, {
					paymentAuthorization: request.paymentAuthorization,
					settledAmount: request.settledAmount,
				});
			}
			if (!signer) {
				throw new Error("Connect your wallet first");
			}
			const subscription = await client.payments.getSubscription(id);
			const authorization = await signX402ChallengeAuthorization({
				fallbackFrom: subscription.subscriber,
				noncePrefix: "sub",
				payment: buildSubscriptionAuthorizationFields({
					subscriptionId: subscription.subscriptionId,
					plan: subscription.plan,
					from: subscription.subscriber,
					to: subscription.provider,
				}),
				signer,
			});
			return client.payments.renewSubscription(id, {
				paymentAuthorization: authorization.signature,
				settledAmount: request?.settledAmount,
			});
		},
		onSuccess: ({ subscription }): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.payments.subscription(subscription.subscriptionId),
			});
		},
	});
}

export function useCancelSubscription(): UseMutationResult<
	void,
	Error,
	string
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (subscriptionId): Promise<void> =>
			client.payments.cancelSubscription(subscriptionId),
		onSuccess: (_response, subscriptionIdValue): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.payments.subscription(subscriptionIdValue),
			});
		},
	});
}
