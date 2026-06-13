import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type {
	BridgeQuote,
	BridgeRoute,
	GasEstimate,
	PriceQuote,
	SupportedChain,
	SwapQuote,
	TradePair,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";

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
