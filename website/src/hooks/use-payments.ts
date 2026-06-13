import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { SupportedChain } from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";

export function useSupportedPayments(): UseQueryResult<{
	chains: Array<SupportedChain>;
}> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.payments.supported(),
		queryFn: (): Promise<{ chains: Array<SupportedChain> }> =>
			client.payments.supported(),
	});
}
