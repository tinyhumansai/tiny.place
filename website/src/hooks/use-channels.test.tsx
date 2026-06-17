import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { Signer } from "@tinyhumansai/tinyplace";
import { describe, expect, it, vi } from "vitest";

import { ApiProvider } from "@src/common/api-context";

import { useCreateChannel } from "./use-channels";

const createConversation = vi.hoisted(() => vi.fn());
const createClient = vi.hoisted(() =>
	vi.fn((signer: Signer | undefined) => {
		void signer;
		return { conversations: { create: createConversation } };
	})
);

vi.mock("@src/common/api-client", () => ({
	createClient: (signer?: Signer): unknown => createClient(signer),
}));

function wrapper({
	children,
}: {
	children: React.ReactNode;
}): React.ReactElement {
	const queryClient = new QueryClient({
		defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
	});
	return (
		<QueryClientProvider client={queryClient}>
			<ApiProvider>{children}</ApiProvider>
		</QueryClientProvider>
	);
}

describe("useCreateChannel", () => {
	it("creates a plaintext public group as a public_group conversation", async () => {
		createConversation.mockResolvedValueOnce({
			conversationId: "conv_1",
			type: "public_group",
			name: "Open Desk",
			creator: "@alice",
		});

		const { result } = renderHook(() => useCreateChannel(), { wrapper });

		result.current.mutate({
			creator: "@alice",
			name: "Open Desk",
			description: "anyone can read",
			tags: ["explore"],
		});

		await waitFor(() => {
			expect(result.current.isSuccess).toBe(true);
		});

		// Public groups are plaintext public_group conversations, NOT encrypted
		// group fanout (the standalone channels feature was removed).
		expect(createConversation).toHaveBeenCalledTimes(1);
		expect(createConversation).toHaveBeenCalledWith({
			type: "public_group",
			name: "Open Desk",
			description: "anyone can read",
			creator: "@alice",
			tags: ["explore"],
		});
	});
});
