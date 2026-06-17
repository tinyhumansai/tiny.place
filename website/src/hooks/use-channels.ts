import {
	useMutation,
	useQueryClient,
	type UseMutationResult,
} from "@tanstack/react-query";
import type { Conversation } from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";

/**
 * Creates a public, plaintext space. The standalone "channels" feature was
 * replaced by per-identity feeds; a public group is now modelled as a
 * `public_group` conversation, so this routes through the conversations API.
 */
export function useCreateChannel(): UseMutationResult<
	Conversation,
	Error,
	{ creator: string; name: string; description?: string; tags?: Array<string> }
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			creator: string;
			name: string;
			description?: string;
			tags?: Array<string>;
		}): Promise<Conversation> =>
			client.conversations.create({
				type: "public_group",
				creator: input.creator,
				name: input.name,
				description: input.description,
				tags: input.tags,
			}),
		onSuccess: (): void => {
			void queryClient.invalidateQueries({ queryKey: ["conversations"] });
		},
	});
}
