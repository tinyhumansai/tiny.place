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
import { useAuthStore } from "@src/store/auth";

type RegistryPaymentChallenge = {
	error: string;
	payment: Omit<X402AuthorizationFields, "expiresAt" | "nonce"> &
		Partial<Pick<X402AuthorizationFields, "expiresAt" | "nonce">>;
};

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
				const challengePayment = challenge.payment;
				const signedPayment = await signX402Authorization(signer, {
					...challengePayment,
					expiresAt:
						challengePayment.expiresAt ??
						new Date(Date.now() + 5 * 60 * 1000).toISOString(),
					from: challengePayment.from || agentId,
					metadata: {
						...challengePayment.metadata,
						domain: challengePayment.metadata?.["domain"] ?? "tiny.place",
						identity: challengePayment.metadata?.["identity"] ?? handle,
						purpose: challengePayment.metadata?.["purpose"] ?? "renewal",
					},
					nonce: challengePayment.nonce || generateNonce("renew"),
				});
				return client.registry.renew(handle, {
					...(request ?? {}),
					payment: x402AuthorizationToPaymentMap(signedPayment),
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
				const challengePayment = challenge.payment;
				const signedPayment = await signX402Authorization(signer, {
					...challengePayment,
					expiresAt:
						challengePayment.expiresAt ??
						new Date(Date.now() + 5 * 60 * 1000).toISOString(),
					from: challengePayment.from || claimRequest.cryptoId,
					metadata: {
						...challengePayment.metadata,
						domain: challengePayment.metadata?.["domain"] ?? "tiny.place",
						identity: challengePayment.metadata?.["identity"] ?? handle,
						purpose: challengePayment.metadata?.["purpose"] ?? "auction_claim",
					},
					nonce: challengePayment.nonce || generateNonce("claim"),
				});
				return client.registry.claim(handle, {
					...claimRequest,
					payment: x402AuthorizationToPaymentMap(signedPayment),
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
