import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import {
	generateNonce,
	identityPublicKey,
	signX402Authorization,
	signerPaymentMetadata,
	TinyPlaceError,
	x402AuthorizationToPaymentMap,
	type IdentityBid,
	type IdentityBuyRequest,
	type IdentityFloor,
	type IdentityListing,
	type IdentityOffer,
	type IdentityOfferAcceptRequest,
	type IdentitySale,
	type MarketplacePrice,
	type X402AuthorizationFields,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";
import {
	useOptionalX402Confirm,
	type X402ConfirmContextValue,
	type X402ConfirmRequest,
} from "@src/components/explore/x402-confirm";
import {
	assertValidX402Challenge,
	type ExpectedX402Payment,
} from "@src/common/x402-challenge";
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

export function useIdentityBids(
	listingId: string
): UseQueryResult<{ bids: Array<IdentityBid> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.marketplace.identityBids(listingId),
		queryFn: (): Promise<{ bids: Array<IdentityBid> }> =>
			client.marketplace.listBids(listingId),
		enabled: listingId.trim().length > 0,
	});
}

/**
 * Lists pending offers, filtered by the targeted handle (`name`, for a seller
 * reviewing incoming offers) and/or the `buyer` (reviewing their own). The key
 * nests under the shared identity-offers prefix so the offer mutations'
 * invalidations refresh every scoped list. Disabled until a filter is given.
 */
export function useIdentityOffers(parameters?: {
	buyer?: string;
	name?: string;
}): UseQueryResult<{ offers: Array<IdentityOffer> }> {
	const client = useApiClient();
	const name = parameters?.name;
	const buyer = parameters?.buyer;
	return useQuery({
		queryKey: [
			...queryKeys.marketplace.identityOffers(),
			name ?? "",
			buyer ?? "",
		],
		queryFn: (): Promise<{ offers: Array<IdentityOffer> }> =>
			client.marketplace.listOffers({ buyer, name }),
		enabled: Boolean(name ?? buyer),
	});
}

type IdentityPaymentChallenge = {
	error: string;
	payment: Omit<X402AuthorizationFields, "expiresAt" | "nonce"> &
		Partial<Pick<X402AuthorizationFields, "expiresAt" | "nonce">>;
};

type ConfirmX402 = X402ConfirmContextValue["confirm"] | undefined;

function identityPaymentChallenge(
	error: unknown
): IdentityPaymentChallenge | null {
	if (!(error instanceof TinyPlaceError) || error.status !== 402) {
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

async function signIdentityPaymentChallenge(
	signer: NonNullable<ReturnType<typeof useAuthStore.getState>["signer"]>,
	challenge: IdentityPaymentChallenge,
	fallbackFrom: string,
	noncePrefix: string,
	expected: ExpectedX402Payment = {},
	confirmX402?: ConfirmX402,
	confirmRequest?: X402ConfirmRequest
): Promise<Record<string, string>> {
	const challengePayment = challenge.payment;
	assertValidX402Challenge(challengePayment, expected);
	const sign = async (): Promise<Record<string, string>> => {
		const signedPayment = await signX402Authorization(signer, {
			...challengePayment,
			expiresAt:
				challengePayment.expiresAt ??
				new Date(Date.now() + 5 * 60 * 1000).toISOString(),
			from: challengePayment.from || fallbackFrom,
			metadata: {
				...challengePayment.metadata,
				...signerPaymentMetadata(signer),
			},
			nonce: challengePayment.nonce || generateNonce(noncePrefix),
		});

		return x402AuthorizationToPaymentMap(signedPayment);
	};

	if (!confirmX402) {
		return sign();
	}

	return (await confirmX402(
		{
			title: confirmRequest?.title ?? "Confirm identity payment",
			subject: confirmRequest?.subject ?? fallbackFrom,
			amount: challengePayment.amount,
			asset: challengePayment.asset,
			recipient: challengePayment.to,
			...confirmRequest,
		},
		sign
	)) as Record<string, string>;
}

export function useCreateIdentityListing(): UseMutationResult<
	IdentityListing,
	Error,
	{
		description?: string;
		expiresAt?: string;
		listingType?: "auction" | "fixed";
		name: string;
		price: MarketplacePrice;
		reservePrice?: MarketplacePrice;
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
			expiresAt,
			listingType,
			name,
			price,
			reservePrice,
			seller,
			sellerCryptoId,
		}): Promise<IdentityListing> => {
			if (!agentId) {
				throw new Error("Connect your wallet first");
			}
			return client.marketplace.createIdentityListing({
				description,
				expiresAt,
				listingType: listingType ?? "fixed",
				name,
				price,
				reservePrice,
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

/**
 * Cancels an active identity listing. Only the listing's seller may cancel it
 * (the backend enforces the signed seller authorization through the SDK client).
 */
export function useDeleteIdentityListing(): UseMutationResult<
	void,
	Error,
	string
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (listingId): Promise<void> =>
			client.marketplace.deleteIdentityListing(listingId),
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
	const confirmX402 = useOptionalX402Confirm();
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
				buyerPublicKey: buyerPublicKey ?? identityPublicKey(signer),
			};

			try {
				return await client.marketplace.buyIdentityListing(listingId, request);
			} catch (error) {
				const challenge = identityPaymentChallenge(error);
				if (!challenge) {
					throw error;
				}

				// Bind the 402 challenge to the listing the user chose to buy: the
				// challenge amount/asset/network must match the cached listing price
				// before the wallet signs, so a tampered challenge can't redirect or
				// inflate the payment.
				const cached = queryClient.getQueryData<{
					listings: Array<IdentityListing>;
				}>(queryKeys.marketplace.identityListings());
				const listing = cached?.listings.find(
					(item) => item.listingId === listingId
				);
				const expected: ExpectedX402Payment = listing
					? {
							amount: listing.price.amount,
							asset: listing.price.asset,
							network: listing.price.network,
						}
					: {};

				return client.marketplace.buyIdentityListing(listingId, {
					...request,
					payment: await signIdentityPaymentChallenge(
						signer,
						challenge,
						buyer,
						"identity",
						expected,
						confirmX402,
						{
							title: "Buy identity",
							subject: listing?.name ?? listingId,
							note: "The server returned an x402 challenge. Confirm to sign the payment authorization and complete the buy.",
							confirmLabel: "Sign x402",
						}
					),
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

export function usePlaceIdentityBid(): UseMutationResult<
	IdentityListing,
	Error,
	{ bid: Partial<IdentityBid>; listingId: string }
> {
	const client = useApiClient();
	const signer = useAuthStore((state) => state.signer);
	const agentId = useAuthStore((state) => state.agentId);
	const confirmX402 = useOptionalX402Confirm();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ bid, listingId }): Promise<IdentityListing> => {
			if (!signer || !agentId) {
				throw new Error("Connect your wallet first");
			}
			if (!bid.bidder) {
				throw new Error("Bidder is required");
			}

			const request: Partial<IdentityBid> = {
				...bid,
				bidderCryptoId: bid.bidderCryptoId ?? agentId,
				bidderPublicKey: bid.bidderPublicKey ?? signer.publicKeyBase64,
			};

			try {
				return await client.marketplace.placeBid(listingId, request);
			} catch (error) {
				const challenge = identityPaymentChallenge(error);
				if (!challenge) {
					throw error;
				}

				return client.marketplace.placeBid(listingId, {
					...request,
					payment: await signIdentityPaymentChallenge(
						signer,
						challenge,
						bid.bidder,
						"identity-bid",
						bid.price
							? {
									amount: bid.price.amount,
									asset: bid.price.asset,
									network: bid.price.network,
								}
							: {},
						confirmX402,
						{
							title: "Place auction bid",
							subject: listingId,
							note: "Confirm to sign the x402 authorization for this bid.",
							confirmLabel: "Sign x402",
						}
					),
				});
			}
		},
		onSuccess: (_listing, { listingId }): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.marketplace.identityListings(),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.marketplace.identityBids(listingId),
			});
		},
	});
}

export function useCloseIdentityAuction(): UseMutationResult<
	IdentitySale,
	Error,
	{
		listingId: string;
		request?: Record<string, unknown>;
		sellerId?: string;
	}
> {
	const client = useApiClient();
	const signer = useAuthStore((state) => state.signer);
	const agentId = useAuthStore((state) => state.agentId);
	const confirmX402 = useOptionalX402Confirm();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			listingId,
			request,
			sellerId,
		}): Promise<IdentitySale> => {
			try {
				return await client.marketplace.closeListing(
					listingId,
					sellerId,
					request
				);
			} catch (error) {
				const challenge = identityPaymentChallenge(error);
				if (!challenge) {
					throw error;
				}
				if (!signer) {
					throw new Error("Connect your wallet first");
				}

				return client.marketplace.closeListing(listingId, sellerId, {
					...request,
					payment: await signIdentityPaymentChallenge(
						signer,
						challenge,
						sellerId ?? agentId ?? "",
						"identity-auction",
						{},
						confirmX402,
						{
							title: "Settle auction",
							subject: listingId,
							note: "Confirm to sign the x402 authorization needed to settle this auction.",
							confirmLabel: "Sign x402",
						}
					),
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
			void queryClient.invalidateQueries({
				queryKey: queryKeys.directory.identities(),
			});
		},
	});
}

export function useDefaultIdentityAuction(): UseMutationResult<
	Record<string, unknown>,
	Error,
	{
		listingId: string;
		request?: Record<string, unknown>;
		sellerId?: string;
	}
> {
	const client = useApiClient();
	const signer = useAuthStore((state) => state.signer);
	const agentId = useAuthStore((state) => state.agentId);
	const confirmX402 = useOptionalX402Confirm();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			listingId,
			request,
			sellerId,
		}): Promise<Record<string, unknown>> => {
			try {
				return await client.marketplace.setDefaultIdentityListing(
					listingId,
					request,
					sellerId
				);
			} catch (error) {
				const challenge = identityPaymentChallenge(error);
				if (!challenge) {
					throw error;
				}
				if (!signer) {
					throw new Error("Connect your wallet first");
				}

				return client.marketplace.setDefaultIdentityListing(
					listingId,
					{
						...request,
						payment: await signIdentityPaymentChallenge(
							signer,
							challenge,
							sellerId ?? agentId ?? "",
							"identity-auction-default",
							{},
							confirmX402,
							{
								title: "Default auction",
								subject: listingId,
								note: "Confirm to sign the x402 authorization needed to default this auction.",
								confirmLabel: "Sign x402",
							}
						),
					},
					sellerId
				);
			}
		},
		onSuccess: (_listing, { listingId }): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.marketplace.identityListings(),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.marketplace.identityBids(listingId),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.directory.identities(),
			});
		},
	});
}

export function useCreateIdentityOffer(): UseMutationResult<
	IdentityOffer,
	Error,
	Partial<IdentityOffer>
> {
	const client = useApiClient();
	const signer = useAuthStore((state) => state.signer);
	const agentId = useAuthStore((state) => state.agentId);
	const confirmX402 = useOptionalX402Confirm();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (offer): Promise<IdentityOffer> => {
			if (!signer || !agentId) {
				throw new Error("Connect your wallet first");
			}
			if (!offer.buyer) {
				throw new Error("Offer buyer is required");
			}

			const request: Partial<IdentityOffer> = {
				...offer,
				buyerCryptoId: offer.buyerCryptoId ?? agentId,
				buyerPublicKey: offer.buyerPublicKey ?? signer.publicKeyBase64,
				status: offer.status ?? "pending",
			};

			try {
				return await client.marketplace.createOffer(request);
			} catch (error) {
				const challenge = identityPaymentChallenge(error);
				if (!challenge) {
					throw error;
				}

				// The challenge must match the price the user offered, so it can't be
				// silently inflated or redirected before the wallet signs.
				const expected: ExpectedX402Payment = offer.price
					? {
							amount: offer.price.amount,
							asset: offer.price.asset,
							network: offer.price.network,
						}
					: {};

				return client.marketplace.createOffer({
					...request,
					payment: await signIdentityPaymentChallenge(
						signer,
						challenge,
						offer.buyer,
						"identity-offer",
						expected,
						confirmX402,
						{
							title: "Make an offer",
							subject: offer.name ?? "Identity offer",
							note: "Confirm to sign the x402 authorization for this offer.",
							confirmLabel: "Sign x402",
						}
					),
				});
			}
		},
		onSuccess: (): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.marketplace.identityListings(),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.marketplace.identityOffers(),
			});
		},
	});
}

export function useCancelIdentityOffer(): UseMutationResult<
	void,
	Error,
	string
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (offerId): Promise<void> =>
			client.marketplace.cancelOffer(offerId),
		onSuccess: (): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.marketplace.identityOffers(),
			});
		},
	});
}

export function useAcceptIdentityOffer(): UseMutationResult<
	IdentitySale,
	Error,
	{ offerId: string; request: IdentityOfferAcceptRequest }
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ offerId, request }): Promise<IdentitySale> =>
			client.marketplace.acceptOffer(offerId, request),
		onSuccess: (): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.marketplace.identityListings(),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.marketplace.identityOffers(),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.marketplace.identityRecent(),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.directory.identities(),
			});
		},
	});
}
