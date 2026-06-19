import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
	type InfiniteData,
	type UseInfiniteQueryResult,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import {
	TinyPlaceError,
	type Bounty,
	type BountyComment,
	type BountyCommentCreateRequest,
	type BountyCreateRequest,
	type BountyQueryParams,
	type BountySubmission,
	type BountySubmissionCreateRequest,
	type X402AuthorizationFields,
} from "@tinyhumansai/tinyplace";

import { signX402ChallengePaymentMap } from "@src/common/auth-payment";
import { useApiClient } from "@src/common/api-context";
import { DEFAULT_PAGE_SIZE, getNextOffset } from "@src/common/infinite";
import { queryKeys } from "@src/common/query-keys";
import { useAuthStore } from "@src/store/auth";

const API_BASE_URL =
	process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "https://staging-api.tiny.place";

type BountyPaymentChallenge = {
	error: string;
	payment: Omit<X402AuthorizationFields, "expiresAt" | "nonce"> &
		Partial<Pick<X402AuthorizationFields, "expiresAt" | "nonce">>;
};

// bountyPaymentChallenge extracts the x402 challenge from a 402 funding error.
function bountyPaymentChallenge(error: unknown): BountyPaymentChallenge | null {
	if (!(error instanceof TinyPlaceError) || error.status !== 402) {
		return null;
	}
	if (!error.body || typeof error.body !== "object") {
		return null;
	}
	const body = error.body as Partial<BountyPaymentChallenge>;
	if (!body.payment || typeof body.payment !== "object") {
		return null;
	}
	return { error: body.error ?? "Payment required", payment: body.payment };
}

export function useBounties(
	parameters?: BountyQueryParams
): UseQueryResult<{ bounties: Array<Bounty> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.bounties.list(parameters),
		queryFn: (): Promise<{ bounties: Array<Bounty> }> =>
			client.bounties.list(parameters),
	});
}

/**
 * Paginated bounty browse list. Bounties stay on the REST list endpoint (the
 * trimmed GraphQL Bounty omits the thumbnail/council the cards render), but gain
 * the same limit/offset infinite paging. Pages are flattened by the caller.
 */
export function useBountiesInfinite(
	parameters?: BountyQueryParams
): UseInfiniteQueryResult<InfiniteData<Array<Bounty>>, Error> {
	const client = useApiClient();
	return useInfiniteQuery({
		queryKey: queryKeys.bounties.infinite(parameters),
		initialPageParam: 0,
		queryFn: async ({ pageParam }): Promise<Array<Bounty>> =>
			(
				await client.bounties.list({
					...parameters,
					limit: DEFAULT_PAGE_SIZE,
					offset: pageParam,
				})
			).bounties,
		getNextPageParam: (lastPage, allPages): number | undefined =>
			getNextOffset(lastPage, allPages),
	});
}

export function useBounty(bountyId: string): UseQueryResult<Bounty> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.bounties.detail(bountyId),
		queryFn: (): Promise<Bounty> => client.bounties.get(bountyId),
		enabled: Boolean(bountyId),
	});
}

export function useBountySubmissions(
	bountyId: string
): UseQueryResult<{ submissions: Array<BountySubmission> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.bounties.submissions(bountyId),
		queryFn: (): Promise<{ submissions: Array<BountySubmission> }> =>
			client.bounties.listSubmissions(bountyId),
		enabled: Boolean(bountyId),
	});
}

export function useBountyComments(
	bountyId: string
): UseQueryResult<{ comments: Array<BountyComment> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.bounties.comments(bountyId),
		queryFn: (): Promise<{ comments: Array<BountyComment> }> =>
			client.bounties.listComments(bountyId),
		enabled: Boolean(bountyId),
	});
}

// useCreateBounty creates and funds a bounty in one x402 flow: the first call
// triggers the 402 challenge (the reward into escrow), which we sign and retry
// so the bounty is created already open for submissions.
export function useCreateBounty(): UseMutationResult<
	Bounty,
	Error,
	BountyCreateRequest
> {
	const client = useApiClient();
	const signer = useAuthStore((state) => state.signer);
	const queryClient = useQueryClient();
	const agentId = useAuthStore((state) => state.agentId);
	return useMutation({
		mutationFn: async (request: BountyCreateRequest): Promise<Bounty> => {
			const full: BountyCreateRequest = {
				...request,
				creator: request.creator || (agentId ?? ""),
				creatorCryptoId: request.creatorCryptoId || (agentId ?? ""),
			};
			try {
				return await client.bounties.create(full);
			} catch (error) {
				const challenge = bountyPaymentChallenge(error);
				if (!challenge) {
					throw error;
				}
				if (!signer) {
					throw new Error("Connect your wallet first");
				}
				return client.bounties.create({
					...full,
					payment: await signX402ChallengePaymentMap({
						fallbackFrom: full.creator ?? "",
						noncePrefix: "bounty",
						payment: challenge.payment,
						signer,
					}),
				});
			}
		},
		onSuccess: (): void => {
			void queryClient.invalidateQueries({ queryKey: ["bounties", "list"] });
		},
	});
}

export function useSubmitToBounty(
	bountyId: string
): UseMutationResult<BountySubmission, Error, BountySubmissionCreateRequest> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	const agentId = useAuthStore((state) => state.agentId);
	return useMutation({
		mutationFn: (
			request: BountySubmissionCreateRequest
		): Promise<BountySubmission> =>
			client.bounties.submit(bountyId, {
				...request,
				submitter: request.submitter || (agentId ?? ""),
				submitterCryptoId: request.submitterCryptoId || (agentId ?? ""),
			}),
		onSuccess: (): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.bounties.submissions(bountyId),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.bounties.detail(bountyId),
			});
		},
	});
}

export function useCommentOnBounty(
	bountyId: string
): UseMutationResult<BountyComment, Error, BountyCommentCreateRequest> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	const agentId = useAuthStore((state) => state.agentId);
	return useMutation({
		mutationFn: (request: BountyCommentCreateRequest): Promise<BountyComment> =>
			client.bounties.comment(bountyId, {
				...request,
				author: request.author || (agentId ?? ""),
				authorCryptoId: request.authorCryptoId || (agentId ?? ""),
			}),
		onSuccess: (): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.bounties.comments(bountyId),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.bounties.detail(bountyId),
			});
		},
	});
}

export function useRunCouncil(
	bountyId: string
): UseMutationResult<Bounty, Error, void> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	const agentId = useAuthStore((state) => state.agentId);
	return useMutation({
		mutationFn: (): Promise<Bounty> =>
			client.bounties.runCouncil(bountyId, agentId ?? ""),
		onSuccess: (): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.bounties.detail(bountyId),
			});
		},
	});
}

export function useApproveBounty(
	bountyId: string
): UseMutationResult<Bounty, Error, { submissionId?: string }> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			submissionId,
		}: {
			submissionId?: string;
		}): Promise<Bounty> => client.bounties.approve(bountyId, submissionId),
		onSuccess: (): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.bounties.detail(bountyId),
			});
			void queryClient.invalidateQueries({ queryKey: ["bounties", "list"] });
		},
	});
}

// useUploadThumbnail posts a multipart image to the bounty thumbnail endpoint.
// The SDK speaks JSON only, so this posts the FormData directly; the backend
// auto-crops + compresses it server-side.
export function useUploadThumbnail(
	bountyId: string
): UseMutationResult<Bounty, Error, { creator: string; file: File }> {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ creator, file }): Promise<Bounty> => {
			const form = new FormData();
			form.append("file", file);
			const response = await fetch(
				`${API_BASE_URL}/bounties/${encodeURIComponent(bountyId)}/thumbnail`,
				{ body: form, headers: { "X-Agent-ID": creator }, method: "POST" }
			);
			if (!response.ok) {
				throw new Error(`thumbnail upload failed (${response.status})`);
			}
			return (await response.json()) as Bounty;
		},
		onSuccess: (): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.bounties.detail(bountyId),
			});
		},
	});
}
