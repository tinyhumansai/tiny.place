import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import {
	signX402Authorization,
	TinyPlaceError,
	type CommercePaymentPayload,
	type LotteryBuyRequest,
	type LotteryBuyResponse,
	type LotteryHolding,
	type LotteryRound,
	type LotteryRoundQueryParams,
	type LotteryRoundsResponse,
	type LotteryView,
	type X402Authorization,
	type X402AuthorizationFields,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";
import { useAuthStore } from "@src/store/auth";

type LotteryPaymentChallenge = {
	error: string;
	payment: Omit<X402AuthorizationFields, "expiresAt" | "nonce"> &
		Partial<Pick<X402AuthorizationFields, "expiresAt" | "nonce">>;
};

function lotteryPaymentChallenge(
	error: unknown
): LotteryPaymentChallenge | null {
	if (!(error instanceof TinyPlaceError) || error.status !== 402) {
		return null;
	}
	if (!error.body || typeof error.body !== "object") {
		return null;
	}
	const body = error.body as Partial<LotteryPaymentChallenge>;
	if (!body.payment || typeof body.payment !== "object") {
		return null;
	}
	return {
		error: body.error ?? "Payment required",
		payment: body.payment,
	};
}

function invalidateLottery(
	queryClient: ReturnType<typeof useQueryClient>
): void {
	void queryClient.invalidateQueries({ queryKey: ["lottery"] });
}

function commercePaymentPayload(
	authorization: X402Authorization
): CommercePaymentPayload {
	return {
		amount: authorization.amount,
		asset: authorization.asset,
		expiresAt: authorization.expiresAt,
		from: authorization.from,
		metadata: authorization.metadata,
		network: authorization.network,
		nonce: authorization.nonce,
		scheme: authorization.scheme,
		signature: authorization.signature,
		to: authorization.to,
	};
}

export function useLottery(): UseQueryResult<LotteryView> {
	const client = useApiClient();
	const actorId = useAuthStore((state) => state.agentId);
	return useQuery({
		queryKey: queryKeys.lottery.current(actorId),
		queryFn: (): Promise<LotteryView> => client.lottery.current(actorId),
	});
}

export function useLotteryRounds(
	query?: LotteryRoundQueryParams
): UseQueryResult<{ rounds: Array<LotteryRound> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.lottery.rounds(query),
		queryFn: async (): Promise<{ rounds: Array<LotteryRound> }> => {
			const result: LotteryRoundsResponse =
				await client.lottery.listRounds(query);
			return { rounds: result.rounds ?? [] };
		},
	});
}

export function useLotteryRound(roundId: string): UseQueryResult<LotteryRound> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.lottery.round(roundId),
		queryFn: (): Promise<LotteryRound> => client.lottery.getRound(roundId),
		enabled: Boolean(roundId),
	});
}

export function useLotteryHoldings(): UseQueryResult<LotteryHolding> {
	const client = useApiClient();
	const actorId = useAuthStore((state) => state.agentId);
	return useQuery({
		queryKey: queryKeys.lottery.holdings(actorId),
		queryFn: (): Promise<LotteryHolding> => client.lottery.holdings(actorId),
		enabled: Boolean(actorId),
	});
}

export function useBuyLotteryTickets(): UseMutationResult<
	LotteryBuyResponse,
	Error,
	LotteryBuyRequest
> {
	const client = useApiClient();
	const signer = useAuthStore((state) => state.signer);
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (request): Promise<LotteryBuyResponse> => {
			try {
				return await client.lottery.buy(request);
			} catch (error) {
				const challenge = lotteryPaymentChallenge(error);
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
					from: challengePayment.from || request.agentId || "",
					metadata: challengePayment.metadata,
					nonce: challengePayment.nonce ?? "",
				});
				return client.lottery.buy({
					...request,
					payment: commercePaymentPayload(signedPayment),
				});
			}
		},
		onSuccess: (): void => {
			invalidateLottery(queryClient);
		},
	});
}
