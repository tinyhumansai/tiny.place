import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import type {
	Escrow,
	EscrowCreateRequest,
	EscrowDispute,
	EscrowMilestone,
	EscrowQueryParams,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";

function useEscrowAction<TVariables extends { escrowId: string }>(
	mutationFn: (variables: TVariables) => Promise<Escrow>
): UseMutationResult<Escrow, Error, TVariables> {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn,
		onSuccess: (escrow): void => {
			void queryClient.invalidateQueries({ queryKey: ["escrow", "list"] });
			void queryClient.invalidateQueries({
				queryKey: queryKeys.escrow.detail(escrow.escrowId),
			});
		},
	});
}

function useEscrowDisputeAction<TVariables extends { escrowId: string }>(
	mutationFn: (variables: TVariables) => Promise<EscrowDispute>
): UseMutationResult<EscrowDispute, Error, TVariables> {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn,
		onSuccess: (dispute, variables): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.escrow.detail(variables.escrowId),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.escrow.dispute(dispute.escrowId),
			});
		},
	});
}

function useEscrowVoidAction<TVariables extends { escrowId: string }>(
	mutationFn: (variables: TVariables) => Promise<void>
): UseMutationResult<void, Error, TVariables> {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn,
		onSuccess: (_result, variables): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.escrow.detail(variables.escrowId),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.escrow.dispute(variables.escrowId),
			});
		},
	});
}

function useEscrowMilestoneAction<TVariables extends { escrowId: string }>(
	mutationFn: (variables: TVariables) => Promise<EscrowMilestone>
): UseMutationResult<EscrowMilestone, Error, TVariables> {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn,
		onSuccess: (_milestone, variables): void => {
			void queryClient.invalidateQueries({ queryKey: ["escrow", "list"] });
			void queryClient.invalidateQueries({
				queryKey: queryKeys.escrow.detail(variables.escrowId),
			});
		},
	});
}

export function useEscrows(
	parameters?: EscrowQueryParams
): UseQueryResult<{ escrows: Array<Escrow> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.escrow.list(parameters),
		queryFn: async (): Promise<{ escrows: Array<Escrow> }> => {
			const result = await client.escrow.list(parameters);
			return { escrows: result.escrows ?? [] };
		},
	});
}

export function useEscrow(escrowId: string): UseQueryResult<Escrow> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.escrow.detail(escrowId),
		queryFn: (): Promise<Escrow> => client.escrow.get(escrowId),
		enabled: Boolean(escrowId),
	});
}

export function useEscrowDispute(
	escrowId: string
): UseQueryResult<EscrowDispute> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.escrow.dispute(escrowId),
		queryFn: (): Promise<EscrowDispute> => client.escrow.getDispute(escrowId),
		enabled: Boolean(escrowId),
	});
}

export function useCreateEscrow(): UseMutationResult<
	Escrow,
	Error,
	EscrowCreateRequest
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (request): Promise<Escrow> => client.escrow.create(request),
		onSuccess: (escrow): void => {
			void queryClient.invalidateQueries({ queryKey: ["escrow", "list"] });
			void queryClient.invalidateQueries({
				queryKey: queryKeys.escrow.detail(escrow.escrowId),
			});
		},
	});
}

export function useAcceptEscrow(): UseMutationResult<
	Escrow,
	Error,
	{ actor: string; escrowId: string }
> {
	const client = useApiClient();
	return useEscrowAction(
		({ actor, escrowId }): Promise<Escrow> =>
			client.escrow.accept(escrowId, actor)
	);
}

export function useCancelEscrow(): UseMutationResult<
	Escrow,
	Error,
	{ actor: string; escrowId: string; onChainTx?: string }
> {
	const client = useApiClient();
	return useEscrowAction(
		({ actor, escrowId, onChainTx }): Promise<Escrow> =>
			client.escrow.cancel(escrowId, actor, onChainTx)
	);
}

export function useDeliverEscrow(): UseMutationResult<
	Escrow,
	Error,
	{ actor: string; description: string; escrowId: string }
> {
	const client = useApiClient();
	return useEscrowAction(
		({ actor, description, escrowId }): Promise<Escrow> =>
			client.escrow.deliver(escrowId, { actor, description })
	);
}

export function useAcceptEscrowDelivery(): UseMutationResult<
	Escrow,
	Error,
	{ actor: string; escrowId: string; onChainTx?: string }
> {
	const client = useApiClient();
	return useEscrowAction(
		({ actor, escrowId, onChainTx }): Promise<Escrow> =>
			client.escrow.acceptDelivery(escrowId, actor, onChainTx)
	);
}

export function useClaimEscrowRelease(): UseMutationResult<
	Escrow,
	Error,
	{ actor: string; escrowId: string; onChainTx?: string }
> {
	const client = useApiClient();
	return useEscrowAction(
		({ actor, escrowId, onChainTx }): Promise<Escrow> =>
			client.escrow.claimRelease(escrowId, actor, onChainTx)
	);
}

export function useClaimEscrowRefund(): UseMutationResult<
	Escrow,
	Error,
	{ actor: string; escrowId: string; onChainTx?: string }
> {
	const client = useApiClient();
	return useEscrowAction(
		({ actor, escrowId, onChainTx }): Promise<Escrow> =>
			client.escrow.claimRefund(escrowId, actor, onChainTx)
	);
}

export function useRequestEscrowRevision(): UseMutationResult<
	Escrow,
	Error,
	{ actor: string; escrowId: string; reason: string }
> {
	const client = useApiClient();
	return useEscrowAction(
		({ actor, escrowId, reason }): Promise<Escrow> =>
			client.escrow.requestRevision(escrowId, reason, actor)
	);
}

export function useExtendEscrowDeadline(): UseMutationResult<
	Escrow,
	Error,
	{ actor: string; deadline: string; escrowId: string }
> {
	const client = useApiClient();
	return useEscrowAction(
		({ actor, deadline, escrowId }): Promise<Escrow> =>
			client.escrow.extendDeadline(escrowId, deadline, actor)
	);
}

export function useApproveEscrowExtension(): UseMutationResult<
	Escrow,
	Error,
	{ actor: string; escrowId: string }
> {
	const client = useApiClient();
	return useEscrowAction(
		({ actor, escrowId }): Promise<Escrow> =>
			client.escrow.approveExtension(escrowId, actor)
	);
}

export function useOpenEscrowDispute(): UseMutationResult<
	EscrowDispute,
	Error,
	{ actor: string; escrowId: string; reason: string }
> {
	const client = useApiClient();
	return useEscrowDisputeAction(
		({ actor, escrowId, reason }): Promise<EscrowDispute> =>
			client.escrow.openDispute(escrowId, reason, actor)
	);
}

export function useSubmitEscrowEvidence(): UseMutationResult<
	void,
	Error,
	{
		actor: string;
		description: string;
		escrowId: string;
		ref?: string;
		type: string;
	}
> {
	const client = useApiClient();
	return useEscrowVoidAction(
		({ actor, description, escrowId, ref, type }): Promise<void> =>
			client.escrow.submitEvidence(escrowId, {
				actor,
				description,
				ref,
				type,
			})
	);
}

export function useAcceptEscrowMediation(): UseMutationResult<
	EscrowDispute,
	Error,
	{ actor: string; escrowId: string }
> {
	const client = useApiClient();
	return useEscrowDisputeAction(
		({ actor, escrowId }): Promise<EscrowDispute> =>
			client.escrow.acceptMediation(escrowId, actor)
	);
}

export function useRejectEscrowMediation(): UseMutationResult<
	EscrowDispute,
	Error,
	{ actor: string; escrowId: string }
> {
	const client = useApiClient();
	return useEscrowDisputeAction(
		({ actor, escrowId }): Promise<EscrowDispute> =>
			client.escrow.rejectMediation(escrowId, actor)
	);
}

export function usePayEscrowArbitration(): UseMutationResult<
	EscrowDispute,
	Error,
	{ actor: string; escrowId: string; onChainTx: string }
> {
	const client = useApiClient();
	return useEscrowDisputeAction(
		({ actor, escrowId, onChainTx }): Promise<EscrowDispute> =>
			client.escrow.payArbitration(escrowId, onChainTx, actor)
	);
}

export function useVoteEscrowArbitration(): UseMutationResult<
	void,
	Error,
	{
		actor?: string;
		clientPct?: number;
		councilMember: string;
		escrowId: string;
		providerPct?: number;
		rationale?: string;
		vote: string;
	}
> {
	const client = useApiClient();
	return useEscrowVoidAction(
		({
			actor,
			clientPct,
			councilMember,
			escrowId,
			providerPct,
			rationale,
			vote,
		}): Promise<void> =>
			client.escrow.voteArbitration(escrowId, {
				actor,
				clientPct,
				councilMember,
				providerPct,
				rationale,
				vote,
			})
	);
}

export function useDeliverEscrowMilestone(): UseMutationResult<
	EscrowMilestone,
	Error,
	{
		actor: string;
		description: string;
		escrowId: string;
		milestoneId: string;
		refs?: Array<string>;
	}
> {
	const client = useApiClient();
	return useEscrowMilestoneAction(
		({
			actor,
			description,
			escrowId,
			milestoneId,
			refs,
		}): Promise<EscrowMilestone> =>
			client.escrow.deliverMilestone(escrowId, milestoneId, {
				actor,
				description,
				refs,
			})
	);
}

export function useAcceptEscrowMilestoneDelivery(): UseMutationResult<
	EscrowMilestone,
	Error,
	{ actor: string; escrowId: string; milestoneId: string; onChainTx?: string }
> {
	const client = useApiClient();
	return useEscrowMilestoneAction(
		({ actor, escrowId, milestoneId, onChainTx }): Promise<EscrowMilestone> =>
			client.escrow.acceptMilestoneDelivery(
				escrowId,
				milestoneId,
				actor,
				onChainTx
			)
	);
}

export function useRequestEscrowMilestoneRevision(): UseMutationResult<
	EscrowMilestone,
	Error,
	{ actor: string; escrowId: string; milestoneId: string; reason: string }
> {
	const client = useApiClient();
	return useEscrowMilestoneAction(
		({ actor, escrowId, milestoneId, reason }): Promise<EscrowMilestone> =>
			client.escrow.requestMilestoneRevision(
				escrowId,
				milestoneId,
				reason,
				actor
			)
	);
}

export function useDisputeEscrowMilestone(): UseMutationResult<
	EscrowDispute,
	Error,
	{ actor: string; escrowId: string; milestoneId: string; reason: string }
> {
	const client = useApiClient();
	return useEscrowDisputeAction(
		({ actor, escrowId, milestoneId, reason }): Promise<EscrowDispute> =>
			client.escrow.disputeMilestone(escrowId, milestoneId, reason, actor)
	);
}
