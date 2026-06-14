import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import type { User, UserProfileUpdate } from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";

/** Reads a wallet's User profile by cryptoId. */
export function useUser(cryptoId: string | undefined): UseQueryResult<User> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.users.detail(cryptoId ?? ""),
		queryFn: (): Promise<User> => client.users.get(cryptoId as string),
		enabled: Boolean(cryptoId),
	});
}

type UpdateUserProfileInput = {
	cryptoId: string;
	update: UserProfileUpdate;
};

/**
 * Updates the signed-in wallet's User profile (display name, bio, avatar,
 * links, tags). On success it invalidates the wallet's User query and any
 * profile views derived from it.
 */
export function useUpdateUserProfile(): UseMutationResult<
	User,
	Error,
	UpdateUserProfileInput
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ cryptoId, update }: UpdateUserProfileInput): Promise<User> =>
			client.users.updateProfile(cryptoId, update),
		onSuccess: (_user, { cryptoId }): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.users.detail(cryptoId),
			});
			void queryClient.invalidateQueries({ queryKey: ["profiles"] });
		},
	});
}
