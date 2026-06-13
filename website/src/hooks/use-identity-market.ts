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
	type IdentityBuyRequest,
	type IdentityFloor,
	type IdentityListing,
	type IdentitySale,
	type MarketplacePrice,
	type X402AuthorizationFields,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";
import { useAuthStore } from "@src/store/auth";

/** Lists identities currently listed for sale on the marketplace. */
export function useIdentityListings(): UseQueryResult<{
	listings: Array<IdentityListing>;
}> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.marketplace.identityListings(),
		queryFn: async (): Promise<{ listings: Array<IdentityListing> }> => {
			const result = await client.marketplace.listIdentities({
				status: "active",
			});
			return { listings: result.identities };
		},
	});
}

/** Recent completed identity sales. */
export function useIdentityRecentSales(): UseQueryResult<{
	recent: Array<IdentitySale>;
}> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.marketplace.identityRecent(),
		queryFn: async (): Promise<{ recent: Array<IdentitySale> }> => {
			const result = await client.marketplace.recent();
			return { recent: result.sales };
		},
	});
}

/** Floor price for listed identities of a given label length. */
export function useIdentityFloor(
	length: number
): UseQueryResult<IdentityFloor> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.marketplace.identityFloor(length),
		queryFn: (): Promise<IdentityFloor> =>
			client.marketplace.identityFloor(length),
	});
}

type IdentityPaymentChallenge = {
	error: string;
	payment: Omit<X402AuthorizationFields, "expiresAt" | "nonce"> &
		Partial<Pick<X402AuthorizationFields, "expiresAt" | "nonce">>;
};

function identityPaymentChallenge(
	error: unknown
): IdentityPaymentChallenge | null {
	if (!(error instanceof TinyVerseError) || error.status !== 402) {
		return null;
	}
	if (!error.body || typeof error.body !== "object") {
		return null;
	}
	const body = error.body as Partial<IdentityPaymentChallenge>;
	if (!body.payment || typeof body.payment !== "object") {
		return null;
	}
	return {
		error: body.error ?? "Payment required",
		payment: body.payment,
	};
}

export function useCreateIdentityListing(): UseMutationResult<
	IdentityListing,
	Error,
	{
		description?: string;
		name: string;
		price: MarketplacePrice;
		seller: string;
		sellerCryptoId?: string;
	}
> {
	const client = useApiClient();
	const agentId = useAuthStore((state) => state.agentId);
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			description,
			name,
			price,
			seller,
			sellerCryptoId,
		}): Promise<IdentityListing> => {
			if (!agentId) {
				throw new Error("Connect your wallet first");
			}
			return client.marketplace.createIdentityListing({
				description,
				listingType: "fixed",
				name,
				price,
				seller,
				sellerCryptoId: sellerCryptoId ?? agentId,
				status: "active",
				type: "identity",
			});
		},
		onSuccess: (): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.marketplace.identityListings(),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.directory.identities(),
			});
		},
	});
}

export function useBuyIdentityListing(): UseMutationResult<
	IdentitySale,
	Error,
	{
		buyer: string;
		buyerCryptoId: string;
		buyerPublicKey?: string;
		listingId: string;
	}
> {
	const client = useApiClient();
	const signer = useAuthStore((state) => state.signer);
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			buyer,
			buyerCryptoId,
			buyerPublicKey,
			listingId,
		}): Promise<IdentitySale> => {
			if (!signer) {
				throw new Error("Connect your wallet first");
			}

			const request: IdentityBuyRequest = {
				buyer,
				buyerCryptoId,
				buyerPublicKey: buyerPublicKey ?? signer.publicKeyBase64,
			};

			try {
				return await client.marketplace.buyIdentityListing(listingId, request);
			} catch (error) {
				const challenge = identityPaymentChallenge(error);
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
					nonce: challengePayment.nonce || generateNonce("identity"),
				});

				return client.marketplace.buyIdentityListing(listingId, {
					...request,
					payment: x402AuthorizationToPaymentMap(signedPayment),
				});
			}
		},
		onSuccess: (): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.marketplace.identityListings(),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.marketplace.identityRecent(),
			});
		},
	});
}
