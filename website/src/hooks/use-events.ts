import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import type {
	Event,
	EventAttendee,
	EventQueryParams,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";

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
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ eventId, ticketType }): Promise<EventAttendee> =>
			client.events.rsvp(eventId, ticketType),
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
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ eventId }): Promise<void> =>
			client.events.cancelRsvp(eventId),
		onSuccess: (_result, variables): void => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.events.list() });
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.detail(variables.eventId),
			});
		},
	});
}
