import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import type {
	ModerationAction,
	ModerationAppeal,
	ModerationReport,
	ModerationReportCreate,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";
import { useAuthStore } from "@src/store/auth";

type ModerationActionParameters = {
	limit?: number;
	offset?: number;
	target?: string;
	type?: string;
};

type AppealRequest = {
	actionId: string;
	comment?: string;
};

export function useModerationActions(
	parameters?: ModerationActionParameters
): UseQueryResult<{ actions: Array<ModerationAction> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.moderation.actions(parameters),
		queryFn: async (): Promise<{ actions: Array<ModerationAction> }> => {
			const result = await client.moderation.listActions(parameters);
			return { actions: result.actions ?? [] };
		},
	});
}

export function useModerationReport(
	reportId: string | undefined
): UseQueryResult<ModerationReport> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.moderation.report(reportId ?? ""),
		queryFn: (): Promise<ModerationReport> => {
			if (!reportId) {
				throw new Error("Report ID is required");
			}
			return client.moderation.getReport(reportId);
		},
		enabled: Boolean(reportId),
	});
}

export function useModerationAppeal(
	appealId: string | undefined
): UseQueryResult<ModerationAppeal> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.moderation.appeal(appealId ?? ""),
		queryFn: (): Promise<ModerationAppeal> => {
			if (!appealId) {
				throw new Error("Appeal ID is required");
			}
			return client.moderation.getAppeal(appealId);
		},
		enabled: Boolean(appealId),
	});
}

export function useCreateModerationReport(): UseMutationResult<
	ModerationReport,
	Error,
	ModerationReportCreate
> {
	const client = useApiClient();
	const agentId = useAuthStore((state) => state.agentId);
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (report): Promise<ModerationReport> => {
			if (!agentId) {
				throw new Error("Connect your wallet first");
			}
			return client.moderation.createReport(report);
		},
		onSuccess: (report): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.moderation.report(report.reportId),
			});
		},
	});
}

export function useCreateModerationAppeal(): UseMutationResult<
	ModerationAppeal,
	Error,
	AppealRequest
> {
	const client = useApiClient();
	const agentId = useAuthStore((state) => state.agentId);
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (appeal): Promise<ModerationAppeal> => {
			if (!agentId) {
				throw new Error("Connect your wallet first");
			}
			return client.moderation.createAppeal(appeal, agentId);
		},
		onSuccess: (appeal): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.moderation.appeal(appeal.appealId),
			});
		},
	});
}
