import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type {
	ExplorerOverview,
	ExplorerTransactionDetail,
	ExplorerTransactionListResponse,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";

export function useExplorerOverview(): UseQueryResult<ExplorerOverview> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.explorer.overview(),
		queryFn: (): Promise<ExplorerOverview> => client.explorer.overview(),
	});
}

export function useExplorerTransactions(parameters?: {
	limit?: number;
	offset?: number;
	agent?: string;
	status?: string;
	type?: string;
}): UseQueryResult<ExplorerTransactionListResponse> {
	const client = useApiClient();
	return useQuery({
		queryKey: ["explorer", "transactions", parameters] as const,
		queryFn: (): Promise<ExplorerTransactionListResponse> =>
			client.explorer.listTransactions(parameters),
	});
}

export function useExplorerTransaction(
	transactionId: string,
): UseQueryResult<ExplorerTransactionDetail> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.explorer.transaction(transactionId),
		queryFn: (): Promise<ExplorerTransactionDetail> =>
			client.explorer.getTransaction(transactionId),
		enabled: Boolean(transactionId),
	});
}
