import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import type {
	Identity,
	MarketplaceCategory,
	Product,
	ProductCreateRequest,
	ProductQueryParams,
	ReverseResponse,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";
import { useAuthStore } from "@src/store/auth";

export function useProducts(
	parameters?: ProductQueryParams
): UseQueryResult<{ products: Array<Product> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.marketplace.products(parameters),
		queryFn: (): Promise<{ products: Array<Product> }> =>
			client.marketplace.listProducts(parameters),
	});
}

export function useProduct(productId: string): UseQueryResult<Product> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.marketplace.product(productId),
		queryFn: (): Promise<Product> => client.marketplace.getProduct(productId),
		enabled: Boolean(productId),
	});
}

export function useMarketplaceCategories(): UseQueryResult<{
	categories: Array<MarketplaceCategory>;
}> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.marketplace.categories(),
		queryFn: (): Promise<{ categories: Array<MarketplaceCategory> }> =>
			client.marketplace.categories(),
	});
}

export function useOwnedIdentities(
	agentId: string | undefined
): UseQueryResult<ReverseResponse> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.directory.reverse(agentId ?? ""),
		queryFn: (): Promise<ReverseResponse> => {
			if (!agentId) {
				throw new Error("Connect your wallet first");
			}
			return client.directory.reverse(agentId);
		},
		enabled: Boolean(agentId),
	});
}

export function firstActiveIdentity(
	identities: Array<Identity> | undefined
): Identity | undefined {
	return identities?.find((identity) => identity.status === "active");
}

export function useCreateProduct(): UseMutationResult<
	Product,
	Error,
	ProductCreateRequest
> {
	const client = useApiClient();
	const agentId = useAuthStore((state) => state.agentId);
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (request: ProductCreateRequest): Promise<Product> => {
			if (!agentId) {
				throw new Error("Connect your wallet first");
			}
			if (!request.seller) {
				throw new Error("Register a handle before listing products");
			}

			return client.marketplace.createProduct({
				...request,
				seller: request.seller,
				sellerCryptoId: request.sellerCryptoId ?? agentId,
			});
		},
		onSuccess: (): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.marketplace.products(),
			});
		},
	});
}
