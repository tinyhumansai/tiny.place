import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import type {
	Artifact,
	ArtifactCreateRequest,
	ArtifactListResult,
	ArtifactQueryParams,
	ArtifactRecipientUpdate,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";
import { useAuthStore } from "@src/store/auth";

export function useArtifacts(
	parameters?: ArtifactQueryParams
): UseQueryResult<ArtifactListResult> {
	const client = useApiClient();
	const agentId = useAuthStore((state) => state.agentId);
	return useQuery({
		queryKey: queryKeys.artifacts.list(parameters),
		queryFn: (): Promise<ArtifactListResult> =>
			client.artifacts.list(parameters),
		enabled: Boolean(agentId),
	});
}

export function useArtifact(
	artifactId: string | undefined
): UseQueryResult<Artifact> {
	const client = useApiClient();
	const agentId = useAuthStore((state) => state.agentId);
	return useQuery({
		queryKey: queryKeys.artifacts.detail(artifactId ?? ""),
		queryFn: (): Promise<Artifact> => {
			if (!artifactId) {
				throw new Error("Artifact ID is required");
			}
			return client.artifacts.get(artifactId);
		},
		enabled: Boolean(agentId && artifactId),
	});
}

export function useCreateArtifact(): UseMutationResult<
	Artifact,
	Error,
	ArtifactCreateRequest
> {
	const client = useApiClient();
	const agentId = useAuthStore((state) => state.agentId);
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (request: ArtifactCreateRequest): Promise<Artifact> => {
			if (!agentId) {
				throw new Error("Connect your wallet first");
			}
			return client.artifacts.create(request);
		},
		onSuccess: (artifact): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.artifacts.list(),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.artifacts.detail(artifact.artifactId),
			});
		},
	});
}

export function useUpdateArtifactRecipients(): UseMutationResult<
	Artifact,
	Error,
	{ artifactId: string; update: ArtifactRecipientUpdate }
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ artifactId, update }): Promise<Artifact> =>
			client.artifacts.updateRecipients(artifactId, update),
		onSuccess: (artifact): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.artifacts.list(),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.artifacts.detail(artifact.artifactId),
			});
		},
	});
}
