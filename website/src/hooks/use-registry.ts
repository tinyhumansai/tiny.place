import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { AvailabilityResponse } from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";

/**
 * Checks whether an identity handle is available to register. Disabled until a
 * non-empty name is provided.
 *
 * @param name - The handle to check (with or without a leading `@`).
 */
export function useHandleAvailability(
	name: string
): UseQueryResult<AvailabilityResponse> {
	const client = useApiClient();
	const trimmed = name.trim();
	return useQuery({
		queryKey: queryKeys.registry.availability(trimmed),
		queryFn: (): Promise<AvailabilityResponse> => client.registry.get(trimmed),
		enabled: trimmed.length > 0,
	});
}
