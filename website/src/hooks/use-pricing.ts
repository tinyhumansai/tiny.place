import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import type {
	BridgeExecuteRequest,
	BridgeExecution,
	BridgeQuote,
	BridgeRoute,
	GasEstimate,
	PriceQuote,
	SupportedChain,
	SwapExecuteRequest,
	SwapExecution,
	SwapQuote,
	TradePair,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";
import { useAuthStore } from "@src/store/auth";

type PriceQuoteParameters = {
	base: string;
	quote: string;
	network?: string;
};

type SwapQuoteParameters = {
	from: string;
	to: string;
	amount: string;
	network?: string;
};

type BridgeParameters = {
	from: string;
	to: string;
	asset: string;
};

type BridgeQuoteParameters = BridgeParameters & {
	amount: string;
};

export function usePriceQuote(
	parameters: PriceQuoteParameters
): UseQueryResult<PriceQuote> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.pricing.quote(parameters),
		queryFn: (): Promise<PriceQuote> => client.pricing.quote(parameters),
		enabled: Boolean(parameters.base && parameters.quote),
	});
}

export function usePricingAssets(): UseQueryResult<{
	assets: Array<{ address?: string; decimals: number; symbol: string }>;
}> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.pricing.assets(),
		queryFn: (): Promise<{
			assets: Array<{ address?: string; decimals: number; symbol: string }>;
		}> => client.pricing.assets(),
	});
}

export function usePricingPairs(): UseQueryResult<{ pairs: Array<TradePair> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.pricing.pairs(),
		queryFn: (): Promise<{ pairs: Array<TradePair> }> => client.pricing.pairs(),
	});
}

export function usePricingNetworks(): UseQueryResult<{
	networks: Array<SupportedChain>;
}> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.pricing.networks(),
		queryFn: (): Promise<{ networks: Array<SupportedChain> }> =>
			client.pricing.networks(),
	});
}

export function useGasEstimate(network: string): UseQueryResult<GasEstimate> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.pricing.gas(network),
		queryFn: (): Promise<GasEstimate> => client.pricing.gas(network),
		enabled: Boolean(network),
	});
}

export function useSwapQuote(
	parameters: SwapQuoteParameters
): UseQueryResult<SwapQuote> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.pricing.swapQuote(parameters),
		queryFn: (): Promise<SwapQuote> => client.pricing.swapQuote(parameters),
		enabled: Boolean(parameters.from && parameters.to && parameters.amount),
	});
}

export function useExecuteSwap(): UseMutationResult<
	SwapExecution,
	Error,
	SwapExecuteRequest
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (request): Promise<SwapExecution> =>
			client.pricing.executeSwap(request),
		onSuccess: (swap): void => {
			void queryClient.invalidateQueries({
				queryKey: ["pricing", "swap-history"],
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.pricing.swapStatus(swap.swapId),
			});
		},
	});
}

export function useSwapStatus(swapId: string): UseQueryResult<SwapExecution> {
	const client = useApiClient();
	const agentId = useAuthStore((state) => state.agentId);
	return useQuery({
		queryKey: queryKeys.pricing.swapStatus(swapId, agentId),
		queryFn: (): Promise<SwapExecution> =>
			client.pricing.getSwap(swapId, agentId),
		enabled: Boolean(swapId),
	});
}

export function useSwapHistory(
	parameters?: { limit?: number; offset?: number },
	enabled = true
): UseQueryResult<{ swaps: Array<SwapExecution> }> {
	const client = useApiClient();
	const agentId = useAuthStore((state) => state.agentId);
	return useQuery({
		queryKey: queryKeys.pricing.swapHistory(parameters, agentId),
		queryFn: async (): Promise<{ swaps: Array<SwapExecution> }> => {
			const result = await client.pricing.swapHistory(parameters, agentId);
			return { swaps: result.swaps ?? [] };
		},
		enabled,
	});
}

export function useBridgeRoutes(
	parameters: BridgeParameters
): UseQueryResult<{ routes: Array<BridgeRoute> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.pricing.bridgeRoutes(parameters),
		queryFn: (): Promise<{ routes: Array<BridgeRoute> }> =>
			client.pricing.bridgeRoutes(parameters),
		enabled: Boolean(parameters.from && parameters.to && parameters.asset),
	});
}

export function useExecuteBridge(): UseMutationResult<
	BridgeExecution,
	Error,
	BridgeExecuteRequest
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (request): Promise<BridgeExecution> =>
			client.pricing.executeBridge(request),
		onSuccess: (bridge): void => {
			void queryClient.invalidateQueries({
				queryKey: ["pricing", "bridge-history"],
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.pricing.bridgeStatus(bridge.bridgeId),
			});
		},
	});
}

export function useBridgeStatus(
	bridgeId: string
): UseQueryResult<BridgeExecution> {
	const client = useApiClient();
	const agentId = useAuthStore((state) => state.agentId);
	return useQuery({
		queryKey: queryKeys.pricing.bridgeStatus(bridgeId, agentId),
		queryFn: (): Promise<BridgeExecution> =>
			client.pricing.getBridge(bridgeId, agentId),
		enabled: Boolean(bridgeId),
	});
}

export function useBridgeHistory(
	parameters?: { limit?: number; offset?: number },
	enabled = true
): UseQueryResult<{ bridges: Array<BridgeExecution> }> {
	const client = useApiClient();
	const agentId = useAuthStore((state) => state.agentId);
	return useQuery({
		queryKey: queryKeys.pricing.bridgeHistory(parameters, agentId),
		queryFn: async (): Promise<{ bridges: Array<BridgeExecution> }> => {
			const result = await client.pricing.bridgeHistory(parameters, agentId);
			return { bridges: result.bridges ?? [] };
		},
		enabled,
	});
}

export function useBridgeQuote(
	parameters: BridgeQuoteParameters
): UseQueryResult<BridgeQuote> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.pricing.bridgeQuote(parameters),
		queryFn: (): Promise<BridgeQuote> => client.pricing.bridgeQuote(parameters),
		enabled: Boolean(
			parameters.from && parameters.to && parameters.asset && parameters.amount
		),
	});
}
