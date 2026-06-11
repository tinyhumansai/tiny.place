import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Event, EventQueryParams } from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";

export function useEvents(
	parameters?: EventQueryParams,
): UseQueryResult<{ events: Array<Event> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.events.list(parameters),
		queryFn: (): Promise<{ events: Array<Event> }> =>
			client.events.list(parameters),
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
