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
	x402AuthorizationToPaymentMap,
	type Event,
	type EventAttendee,
	type EventQueryParams,
	type X402AuthorizationFields,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";
import { useAuthStore } from "@src/store/auth";

type EventPaymentChallenge = {
	error: string;
	payment: Omit<X402AuthorizationFields, "expiresAt" | "nonce"> &
		Partial<Pick<X402AuthorizationFields, "expiresAt" | "nonce">>;
};

function eventPaymentChallenge(error: unknown): EventPaymentChallenge | null {
	if (!(error instanceof TinyVerseError) || error.status !== 402) {
		return null;
	}
	if (!error.body || typeof error.body !== "object") {
		return null;
	}
	const body = error.body as Partial<EventPaymentChallenge>;
	if (!body.payment || typeof body.payment !== "object") {
		return null;
	}
	return {
		error: body.error ?? "Payment required",
		payment: body.payment,
	};
}

export function useEvents(
	parameters?: EventQueryParams
): UseQueryResult<{ events: Array<Event> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.events.list(parameters),
		queryFn: async (): Promise<{ events: Array<Event> }> => {
			const result = await client.events.list(parameters);
			return { events: result.events ?? [] };
		},
	});
}

export function useEvent(eventId: string): UseQueryResult<Event> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.events.detail(eventId),
		queryFn: (): Promise<Event> => client.events.get(eventId),
		enabled: Boolean(eventId),
	});
}

export function useCreateEvent(): UseMutationResult<
	Event,
	Error,
	Partial<Event>
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (event): Promise<Event> => client.events.create(event),
		onSuccess: (event): void => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.events.list() });
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.detail(event.eventId),
			});
		},
	});
}

export function useRsvpEvent(): UseMutationResult<
	EventAttendee,
	Error,
	{ eventId: string; ticketType?: string }
> {
	const client = useApiClient();
	const agentId = useAuthStore((state) => state.agentId);
	const signer = useAuthStore((state) => state.signer);
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ eventId, ticketType }): Promise<EventAttendee> => {
			if (!agentId) {
				throw new Error("Connect your wallet first");
			}
			try {
				return await client.events.rsvp(eventId, {
					agentId,
					tier: ticketType,
				});
			} catch (error) {
				const challenge = eventPaymentChallenge(error);
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
				return client.events.rsvp(eventId, {
					agentId,
					payment: x402AuthorizationToPaymentMap(signedPayment),
					tier: ticketType,
				});
			}
		},
		onSuccess: (attendee): void => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.events.list() });
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.detail(attendee.eventId),
			});
		},
	});
}

export function useCancelEventRsvp(): UseMutationResult<
	void,
	Error,
	{ eventId: string }
> {
	const client = useApiClient();
	const agentId = useAuthStore((state) => state.agentId);
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ eventId }): Promise<void> => {
			if (!agentId) {
				throw new Error("Connect your wallet first");
			}
			return client.events.cancelRsvp(eventId, agentId);
		},
		onSuccess: (_result, variables): void => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.events.list() });
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.detail(variables.eventId),
			});
		},
	});
}
