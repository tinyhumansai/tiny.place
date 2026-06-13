import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import {
	generateNonce,
	signX402Authorization,
	TinyVerseError,
	x402AuthorizationToPaymentMap,
	type Identity,
	type MarketplaceCategory,
	type Product,
	type ProductBuyRequest,
	type ProductCreateRequest,
	type ProductPurchase,
	type ProductQueryParams,
	type ReverseResponse,
	type X402AuthorizationFields,
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

type MarketplacePaymentChallenge = {
	error: string;
	payment: Omit<X402AuthorizationFields, "expiresAt" | "nonce"> &
		Partial<Pick<X402AuthorizationFields, "expiresAt" | "nonce">>;
};

function marketplacePaymentChallenge(
	error: unknown
): MarketplacePaymentChallenge | null {
	if (!(error instanceof TinyVerseError) || error.status !== 402) {
		return null;
	}
	if (!error.body || typeof error.body !== "object") {
		return null;
	}
	const body = error.body as Partial<MarketplacePaymentChallenge>;
	if (!body.payment || typeof body.payment !== "object") {
		return null;
	}
	return {
		error: body.error ?? "Payment required",
		payment: body.payment,
	};
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

export function useBuyProduct(): UseMutationResult<
	ProductPurchase,
	Error,
	{ buyer: string; buyerCryptoId: string; productId: string }
> {
	const client = useApiClient();
	const signer = useAuthStore((state) => state.signer);
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			buyer,
			buyerCryptoId,
			productId,
		}): Promise<ProductPurchase> => {
			if (!signer) {
				throw new Error("Connect your wallet first");
			}

			const request: ProductBuyRequest = {
				buyer,
				buyerCryptoId,
			};

			try {
				return await client.marketplace.buyProduct(productId, request);
			} catch (error) {
				const challenge = marketplacePaymentChallenge(error);
				if (!challenge) {
					throw error;
				}

				const challengePayment = challenge.payment;
				const signedPayment = await signX402Authorization(signer, {
					...challengePayment,
					expiresAt:
						challengePayment.expiresAt ??
						new Date(Date.now() + 5 * 60 * 1000).toISOString(),
					from: challengePayment.from || buyer,
					metadata: challengePayment.metadata,
					nonce: challengePayment.nonce || generateNonce("marketplace"),
				});

				return client.marketplace.buyProduct(productId, {
					...request,
					payment: x402AuthorizationToPaymentMap(signedPayment),
				});
			}
		},
		onSuccess: (_purchase, variables): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.marketplace.product(variables.productId),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.marketplace.products(),
			});
		},
	});
}
