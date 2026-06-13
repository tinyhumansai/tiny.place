import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import {
	signX402Authorization,
	TinyVerseError,
	type GroupCreateRequest,
	type GroupMember,
	type GroupMetadata,
	type GroupQueryParams,
	type X402AuthorizationFields,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";
import { useAuthStore } from "@src/store/auth";

type GroupPaymentChallenge = {
	error: string;
	payment: Omit<X402AuthorizationFields, "expiresAt" | "nonce"> &
		Partial<Pick<X402AuthorizationFields, "expiresAt" | "nonce">>;
};

function groupPaymentChallenge(error: unknown): GroupPaymentChallenge | null {
	if (!(error instanceof TinyVerseError) || error.status !== 402) {
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
			void queryClient.invalidateQueries({ queryKey: ["groups", "list"] });
			void queryClient.invalidateQueries({
				queryKey: queryKeys.groups.detail(group.groupId),
			});
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
				const signedPayment = await signX402Authorization(signer, {
					...challengePayment,
					expiresAt: challengePayment.expiresAt ?? "",
					from: challengePayment.from || agentId,
					metadata: challengePayment.metadata,
					nonce: challengePayment.nonce ?? "",
				});
				return client.groups.join(groupId, {
					agentId,
					paymentAuthorization: signedPayment.signature,
				});
			}
		},
		onSuccess: (member): void => {
			void queryClient.invalidateQueries({ queryKey: ["groups", "list"] });
			void queryClient.invalidateQueries({
				queryKey: queryKeys.groups.detail(member.groupId),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.groups.members(member.groupId),
			});
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
				const signedPayment = await signX402Authorization(signer, {
					...challengePayment,
					expiresAt: challengePayment.expiresAt ?? "",
					from: challengePayment.from || agentId,
					metadata: challengePayment.metadata,
					nonce: challengePayment.nonce ?? "",
				});
				return client.groups.renewMemberSubscription(groupId, agentId, {
					paymentAuthorization: signedPayment.signature,
				});
			}
		},
		onSuccess: (member): void => {
			void queryClient.invalidateQueries({ queryKey: ["groups", "list"] });
			void queryClient.invalidateQueries({
				queryKey: queryKeys.groups.detail(member.groupId),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.groups.members(member.groupId),
			});
		},
	});
}
