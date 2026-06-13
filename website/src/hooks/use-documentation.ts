import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";

export function useSwaggerDocument(): UseQueryResult<Record<string, unknown>> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.docs.swagger(),
		queryFn: (): Promise<Record<string, unknown>> => client.docs.swaggerJson(),
	});
}
