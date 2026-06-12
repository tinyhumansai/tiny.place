import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Constitution } from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";

/** Fetches the current public constitution (rules, version, effective date). */
export function useConstitution(): UseQueryResult<Constitution> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.constitution.detail(),
		queryFn: (): Promise<Constitution> => client.moderation.getConstitution(),
	});
}
