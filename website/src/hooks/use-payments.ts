import {
	useMutation,
	useQuery,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import type {
	SupportedChain,
	X402SettleRequest,
	X402SettleResponse,
	X402VerifyRequest,
	X402VerifyResponse,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";

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
