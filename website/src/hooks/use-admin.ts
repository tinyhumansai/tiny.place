import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import type {
	AdminAuditEntry,
	AdminFeeMetrics,
	FeeConfig,
	FeeResolveParams,
	FeeResolveResponse,
	LedgerType,
	SystemConfig,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";

type AuditParameters = {
	limit?: number;
	offset?: number;
};

type ConfigUpdate = {
	key: string;
	reason?: string;
	value: string;
};

export function useAdminConfig(): UseQueryResult<{
	config: Record<string, string>;
}> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.admin.config(),
		queryFn: (): Promise<{ config: Record<string, string> }> =>
			client.admin.getConfig(),
		retry: false,
	});
}

export function useAdminFees(): UseQueryResult<{ fees: Array<FeeConfig> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.admin.fees(),
		queryFn: (): Promise<{ fees: Array<FeeConfig> }> => client.admin.listFees(),
		retry: false,
	});
}

export function useAdminFeeResolution(
	parameters: FeeResolveParams
): UseQueryResult<FeeResolveResponse> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.admin.feeResolution({
			from: parameters.from,
			to: parameters.to,
			type: parameters.type,
		}),
		queryFn: (): Promise<FeeResolveResponse> =>
			client.admin.resolveFee(parameters),
		enabled: Boolean(parameters.from && parameters.to && parameters.type),
		retry: false,
	});
}

export function useAdminAudit(
	parameters?: AuditParameters
): UseQueryResult<{ audit: Array<AdminAuditEntry> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.admin.audit(parameters),
		queryFn: (): Promise<{ audit: Array<AdminAuditEntry> }> =>
			client.admin.audit(parameters),
		retry: false,
	});
}

export function useAdminFeeMetrics(): UseQueryResult<AdminFeeMetrics> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.admin.feeMetrics(),
		queryFn: (): Promise<AdminFeeMetrics> => client.admin.feeMetrics(),
		retry: false,
	});
}

export function useUpdateAdminConfig(): UseMutationResult<
	SystemConfig,
	Error,
	ConfigUpdate
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ key, reason, value }): Promise<SystemConfig> =>
			client.admin.setConfig(key, value, reason),
		onSuccess: (): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.admin.config(),
			});
			void queryClient.invalidateQueries({ queryKey: queryKeys.admin.audit() });
		},
	});
}

export const ADMIN_FEE_TYPES: Array<LedgerType> = [
	"SALE",
	"PAYMENT",
	"SUBSCRIPTION",
	"GROUP_FEE",
	"REVENUE_SHARE",
];
