import {
	useMutation,
	useQuery,
	useQueryClient,
	type QueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import {
	TinyPlaceError,
	type GroupCreateRequest,
	type GroupInvite,
	type GroupInviteCreateRequest,
	type GroupInvitePreview,
	type GroupMember,
	type GroupMemberRole,
	type GroupMetadata,
	type GroupQueryParams,
	type X402AuthorizationFields,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { signX402ChallengeAuthorization } from "@src/common/auth-payment";
import { queryKeys } from "@src/common/query-keys";
import { assertValidX402Challenge } from "@src/common/x402-challenge";
import { useAuthStore } from "@src/store/auth";

type GroupPaymentChallenge = {
	error: string;
	payment: Omit<X402AuthorizationFields, "expiresAt" | "nonce"> &
		Partial<Pick<X402AuthorizationFields, "expiresAt" | "nonce">>;
};

function groupPaymentChallenge(error: unknown): GroupPaymentChallenge | null {
	if (!(error instanceof TinyPlaceError) || error.status !== 402) {
		return null;
	}
	if (!error.body || typeof error.body !== "object") {
		return null;
	}
	const body = error.body as Partial<GroupPaymentChallenge>;
	if (!body.payment || typeof body.payment !== "object") {
		return null;
	}
	return {
		error: body.error ?? "Payment required",
		payment: body.payment,
	};
}

// Invalidating the "groups" prefix refreshes the public directory, the My
// Groups view, group detail, and member lists in one call — TanStack matches
// query keys by prefix, so this covers every groups.* key.
function invalidateGroups(queryClient: QueryClient): void {
	void queryClient.invalidateQueries({ queryKey: ["groups"] });
}

/** Public directory: only public (open) groups. */
export function useGroups(
	parameters?: GroupQueryParams
): UseQueryResult<{ groups: Array<GroupMetadata> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.groups.list(parameters),
		queryFn: (): Promise<{ groups: Array<GroupMetadata> }> =>
			client.groups.list(parameters),
	});
}

/** My Groups: every group the agent belongs to, including private ones. */
export function useMyGroups(
	member: string
): UseQueryResult<{ groups: Array<GroupMetadata> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.groups.mine(member),
		queryFn: (): Promise<{ groups: Array<GroupMetadata> }> =>
			client.groups.list({ member }),
		enabled: Boolean(member),
	});
}

export function useGroup(groupId: string): UseQueryResult<GroupMetadata> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.groups.detail(groupId),
		queryFn: (): Promise<GroupMetadata> => client.groups.get(groupId),
		enabled: Boolean(groupId),
	});
}

export function useGroupMembers(
	groupId: string
): UseQueryResult<{ members: Array<GroupMember> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.groups.members(groupId),
		queryFn: (): Promise<{ members: Array<GroupMember> }> =>
			client.groups.members(groupId),
		enabled: Boolean(groupId),
	});
}

export function useCreateGroup(): UseMutationResult<
	GroupMetadata,
	Error,
	GroupCreateRequest
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (request): Promise<GroupMetadata> =>
			client.groups.create(request),
		onSuccess: (group): void => {
			// Reflect the new group immediately in My Groups so the UI updates
			// without waiting for a refetch (private groups never appear in the
			// public directory, so an optimistic insert here is essential).
			if (group.createdBy) {
				queryClient.setQueryData<{ groups: Array<GroupMetadata> }>(
					queryKeys.groups.mine(group.createdBy),
					(previous) => ({
						groups: [
							group,
							...(previous?.groups ?? []).filter(
								(existing) => existing.groupId !== group.groupId
							),
						],
					})
				);
			}
			invalidateGroups(queryClient);
		},
	});
}

export function useJoinGroup(): UseMutationResult<
	GroupMember,
	Error,
	{ agentId: string; groupId: string; paymentAuthorization?: string }
> {
	const client = useApiClient();
	const signer = useAuthStore((state) => state.signer);
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			agentId,
			groupId,
			paymentAuthorization,
		}): Promise<GroupMember> => {
			try {
				return await client.groups.join(groupId, {
					agentId,
					paymentAuthorization,
				});
			} catch (error) {
				const challenge = groupPaymentChallenge(error);
				if (!challenge) {
					throw error;
				}
				if (!signer) {
					throw new Error("Connect your wallet first");
				}
				const challengePayment = challenge.payment;
				assertValidX402Challenge(challengePayment);
				const signedPayment = await signX402ChallengeAuthorization({
					fallbackFrom: agentId,
					noncePrefix: "group",
					payment: challengePayment,
					signer,
				});
				return client.groups.join(groupId, {
					agentId,
					paymentAuthorization: signedPayment.signature,
				});
			}
		},
		onSuccess: (): void => {
			invalidateGroups(queryClient);
		},
	});
}

export function useRenewGroupSubscription(): UseMutationResult<
	GroupMember,
	Error,
	{ agentId: string; groupId: string; paymentAuthorization?: string }
> {
	const client = useApiClient();
	const signer = useAuthStore((state) => state.signer);
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			agentId,
			groupId,
			paymentAuthorization,
		}): Promise<GroupMember> => {
			try {
				return await client.groups.renewMemberSubscription(groupId, agentId, {
					paymentAuthorization,
				});
			} catch (error) {
				const challenge = groupPaymentChallenge(error);
				if (!challenge) {
					throw error;
				}
				if (!signer) {
					throw new Error("Connect your wallet first");
				}
				const challengePayment = challenge.payment;
				assertValidX402Challenge(challengePayment);
				const signedPayment = await signX402ChallengeAuthorization({
					fallbackFrom: agentId,
					noncePrefix: "group",
					payment: challengePayment,
					signer,
				});
				return client.groups.renewMemberSubscription(groupId, agentId, {
					paymentAuthorization: signedPayment.signature,
				});
			}
		},
		onSuccess: (): void => {
			invalidateGroups(queryClient);
		},
	});
}

export function useSetGroupMemberRole(): UseMutationResult<
	GroupMember,
	Error,
	{ actor: string; agentId: string; groupId: string; role: GroupMemberRole }
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ actor, agentId, groupId, role }): Promise<GroupMember> =>
			client.groups.setMemberRole(groupId, agentId, role, actor),
		onSuccess: (member): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.groups.members(member.groupId),
			});
		},
	});
}

// --- Invite links ---------------------------------------------------------

/** Active invites for a group, visible to admins only. */
export function useGroupInvites(
	groupId: string,
	actor: string
): UseQueryResult<{ invites: Array<GroupInvite> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.groups.invites(groupId, actor),
		queryFn: (): Promise<{ invites: Array<GroupInvite> }> =>
			client.groups.listInvites(groupId, actor),
		enabled: Boolean(groupId && actor),
	});
}

/** Public preview of the group behind an invite token (no auth). */
export function useGroupInvitePreview(
	groupId: string,
	token: string
): UseQueryResult<GroupInvitePreview> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.groups.invitePreview(groupId, token),
		queryFn: (): Promise<GroupInvitePreview> =>
			client.groups.previewInvite(groupId, token),
		enabled: Boolean(groupId && token),
		retry: false,
	});
}

export function useCreateGroupInvite(): UseMutationResult<
	GroupInvite,
	Error,
	{ actor: string; groupId: string; request?: GroupInviteCreateRequest }
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ actor, groupId, request }): Promise<GroupInvite> =>
			client.groups.createInvite(groupId, actor, request),
		onSuccess: (invite, variables): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.groups.invites(invite.groupId, variables.actor),
			});
		},
	});
}

export function useRevokeGroupInvite(): UseMutationResult<
	void,
	Error,
	{ actor: string; groupId: string; token: string }
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ actor, groupId, token }): Promise<void> =>
			client.groups.revokeInvite(groupId, token, actor),
		onSuccess: (_result, variables): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.groups.invites(variables.groupId, variables.actor),
			});
		},
	});
}

export function useRedeemGroupInvite(): UseMutationResult<
	GroupMember,
	Error,
	{ agentId: string; groupId: string; token: string }
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ agentId, groupId, token }): Promise<GroupMember> =>
			client.groups.redeemInvite(groupId, token, agentId),
		onSuccess: (): void => {
			invalidateGroups(queryClient);
		},
	});
}
