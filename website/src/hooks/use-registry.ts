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
	TinyPlaceError,
	x402AuthorizationToPaymentMap,
	type AvailabilityResponse,
	type Identity,
	type IdentityClaimRequest,
	type RenewalRequest,
	type X402AuthorizationFields,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";
import { signerPaymentMetadata } from "@src/common/x402-signer-metadata";
import {
	useOptionalX402Confirm,
	type X402ConfirmContextValue,
	type X402ConfirmRequest,
} from "@src/components/explore/x402-confirm";
import { useAuthStore } from "@src/store/auth";

type RegistryPaymentChallenge = {
	error: string;
	payment: Omit<X402AuthorizationFields, "expiresAt" | "nonce"> &
		Partial<Pick<X402AuthorizationFields, "expiresAt" | "nonce">>;
};

type ConfirmX402 = X402ConfirmContextValue["confirm"] | undefined;

function registryPaymentChallenge(
	error: unknown
): RegistryPaymentChallenge | null {
	if (!(error instanceof TinyPlaceError) || error.status !== 402) {
		return null;
	}
	if (!error.body || typeof error.body !== "object") {
		return null;
	}
	const body = error.body as Partial<RegistryPaymentChallenge>;
	if (!body.payment || typeof body.payment !== "object") {
		return null;
	}
	return {
		error: body.error ?? "Payment required",
		payment: body.payment,
	};
}

async function signRegistryPaymentChallenge(
	signer: NonNullable<ReturnType<typeof useAuthStore.getState>["signer"]>,
	challenge: RegistryPaymentChallenge,
	options: {
		confirmRequest: X402ConfirmRequest;
		confirmX402?: ConfirmX402;
		fallbackFrom: string;
		handle: string;
		noncePrefix: string;
		purpose: string;
	}
): Promise<Record<string, string>> {
	const challengePayment = challenge.payment;
	const sign = async (): Promise<Record<string, string>> => {
		const signedPayment = await signX402Authorization(signer, {
			...challengePayment,
			expiresAt:
				challengePayment.expiresAt ??
				new Date(Date.now() + 5 * 60 * 1000).toISOString(),
			from: challengePayment.from || options.fallbackFrom,
			metadata: {
				...challengePayment.metadata,
				...signerPaymentMetadata(signer),
				domain: challengePayment.metadata?.["domain"] ?? "tiny.place",
				identity: challengePayment.metadata?.["identity"] ?? options.handle,
				purpose: challengePayment.metadata?.["purpose"] ?? options.purpose,
			},
			nonce: challengePayment.nonce || generateNonce(options.noncePrefix),
		});
		return x402AuthorizationToPaymentMap(signedPayment);
	};

	if (!options.confirmX402) {
		return sign();
	}

	return (await options.confirmX402(
		{
			amount: challengePayment.amount,
			asset: challengePayment.asset,
			recipient: challengePayment.to,
			...options.confirmRequest,
		},
		sign
	)) as Record<string, string>;
}

/**
 * Checks whether an identity handle is available to register. Disabled until a
 * non-empty name is provided. A leading `@` is normalized away so `atlas` and
 * `@atlas` resolve to the same query and backend lookup.
 *
 * @param name - The handle to check (with or without a leading `@`).
 */
export function useHandleAvailability(
	name: string
): UseQueryResult<AvailabilityResponse> {
	const client = useApiClient();
	const normalized = name.trim().replace(/^@+/, "");
	return useQuery({
		queryKey: queryKeys.registry.availability(normalized),
		queryFn: (): Promise<AvailabilityResponse> =>
			client.registry.get(normalized),
		enabled: normalized.length > 0,
	});
}

export function useRenewIdentity(): UseMutationResult<
	Identity,
	Error,
	{ name: string; request?: RenewalRequest }
> {
	const client = useApiClient();
	const signer = useAuthStore((state) => state.signer);
	const agentId = useAuthStore((state) => state.agentId);
	const confirmX402 = useOptionalX402Confirm();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ name, request }): Promise<Identity> => {
			const normalized = name.trim().replace(/^@+/, "");
			if (!normalized) {
				throw new Error("Identity name is required");
			}
			const handle = `@${normalized}`;
			try {
				return await client.registry.renew(handle, request ?? {});
			} catch (error) {
				const challenge = registryPaymentChallenge(error);
				if (!challenge) {
					throw error;
				}
				if (!signer || !agentId) {
					throw new Error("Connect your wallet first");
				}
				return client.registry.renew(handle, {
					...(request ?? {}),
					payment: await signRegistryPaymentChallenge(signer, challenge, {
						confirmRequest: {
							title: "Renew identity",
							subject: handle,
							note: "The server returned an x402 renewal challenge. Confirm to sign the payment authorization and renew this identity.",
							confirmLabel: "Sign x402",
						},
						confirmX402,
						fallbackFrom: agentId,
						handle,
						noncePrefix: "renew",
						purpose: "renewal",
					}),
				});
			}
		},
		onSuccess: (identity): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.registry.availability(
					identity.username.trim().replace(/^@+/, "")
				),
			});
		},
	});
}

/**
 * Assigns or unassigns a name as the connected wallet's primary handle. A
 * primary name is the wallet's display identity and is locked from sale; at
 * most one name per wallet is primary, so assigning one unassigns the rest.
 */
export function useSetPrimaryIdentity(): UseMutationResult<
	Identity,
	Error,
	{ name: string; primary: boolean }
> {
	const client = useApiClient();
	const agentId = useAuthStore((state) => state.agentId);
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ name, primary }): Promise<Identity> => {
			const normalized = name.trim().replace(/^@+/, "");
			if (!normalized) {
				throw new Error("Identity name is required");
			}
			const handle = `@${normalized}`;
			return primary
				? client.registry.assignPrimary(handle)
				: client.registry.unassignPrimary(handle);
		},
		onSuccess: (identity): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.registry.availability(
					identity.username.trim().replace(/^@+/, "")
				),
			});
			if (agentId) {
				void queryClient.invalidateQueries({
					queryKey: queryKeys.directory.reverse(agentId),
				});
			}
			void queryClient.invalidateQueries({
				queryKey: queryKeys.directory.identities(),
			});
		},
	});
}

/**
 * Directly transfers a name the connected wallet owns to another wallet, with
 * no payment (a gift or account move). The current owner's signing key
 * authorizes the move; the recipient is identified by their cryptoId + the
 * publicKey it derives from. Invalidates the old owner's reverse lookup, the
 * name's availability, and the directory listing so the UI reflects the new
 * owner.
 */
export function useTransferIdentity(): UseMutationResult<
	Identity,
	Error,
	{ cryptoId: string; name: string; publicKey: string }
> {
	const client = useApiClient();
	const agentId = useAuthStore((state) => state.agentId);
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ cryptoId, name, publicKey }): Promise<Identity> => {
			const normalized = name.trim().replace(/^@+/, "");
			if (!normalized) {
				throw new Error("Identity name is required");
			}
			if (!cryptoId || !publicKey) {
				throw new Error("Recipient wallet is required");
			}
			return client.registry.transfer(`@${normalized}`, {
				cryptoId,
				publicKey,
			});
		},
		onSuccess: (identity): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.registry.availability(
					identity.username.trim().replace(/^@+/, "")
				),
			});
			if (agentId) {
				void queryClient.invalidateQueries({
					queryKey: queryKeys.directory.reverse(agentId),
				});
			}
			void queryClient.invalidateQueries({
				queryKey: queryKeys.directory.identities(),
			});
		},
	});
}

export function useClaimIdentity(): UseMutationResult<
	Identity,
	Error,
	{ name: string; request?: Partial<IdentityClaimRequest> }
> {
	const client = useApiClient();
	const signer = useAuthStore((state) => state.signer);
	const agentId = useAuthStore((state) => state.agentId);
	const confirmX402 = useOptionalX402Confirm();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ name, request }): Promise<Identity> => {
			const normalized = name.trim().replace(/^@+/, "");
			if (!normalized) {
				throw new Error("Identity name is required");
			}
			if (!signer || !agentId) {
				throw new Error("Connect your wallet first");
			}

			const handle = `@${normalized}`;
			const claimRequest: IdentityClaimRequest = {
				cryptoId: request?.cryptoId ?? agentId,
				publicKey: request?.publicKey ?? signer.publicKeyBase64,
				...(request?.payment ? { payment: request.payment } : {}),
				...(request?.signature ? { signature: request.signature } : {}),
			};

			try {
				return await client.registry.claim(handle, claimRequest);
			} catch (error) {
				const challenge = registryPaymentChallenge(error);
				if (!challenge) {
					throw error;
				}
				return client.registry.claim(handle, {
					...claimRequest,
					payment: await signRegistryPaymentChallenge(signer, challenge, {
						confirmRequest: {
							title: "Claim identity",
							subject: handle,
							note: "Confirm to sign the x402 authorization needed to claim this identity.",
							confirmLabel: "Sign x402",
						},
						confirmX402,
						fallbackFrom: claimRequest.cryptoId,
						handle,
						noncePrefix: "claim",
						purpose: "auction_claim",
					}),
				});
			}
		},
		onSuccess: (identity): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.registry.availability(
					identity.username.trim().replace(/^@+/, "")
				),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.directory.identities(),
			});
		},
	});
}
