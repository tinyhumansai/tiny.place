import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type {
	LedgerListParams,
	LedgerTransaction,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";

export function useLedgerTransactions(
	parameters?: LedgerListParams,
): UseQueryResult<{ transactions: Array<LedgerTransaction> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: ["ledger", "transactions", parameters] as const,
		queryFn: (): Promise<{ transactions: Array<LedgerTransaction> }> =>
			client.ledger.list(parameters),
	});
}

export function useLedgerTransaction(
	transactionId: string,
): UseQueryResult<LedgerTransaction> {
	const client = useApiClient();
	return useQuery({
		queryKey: ["ledger", "transaction", transactionId] as const,
		queryFn: (): Promise<LedgerTransaction> =>
			client.ledger.get(transactionId),
		enabled: Boolean(transactionId),
	});
}
