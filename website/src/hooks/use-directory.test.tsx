import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { Signer } from "@tinyhumansai/tinyplace";
import { describe, expect, it, vi } from "vitest";

import { ApiProvider } from "@src/common/api-context";

import { useAgents } from "./use-directory";

const agents = vi.hoisted(() => vi.fn());
const listAgents = vi.hoisted(() => vi.fn());
const createClient = vi.hoisted(() =>
	vi.fn((signer: Signer | undefined) => {
		void signer;
		return {
			graphql: { agents },
			directory: { listAgents },
		};
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

describe("useAgents (GraphQL path)", () => {
	it("reads the directory through GraphQL and preserves viewerIsFollowing", async () => {
		agents.mockResolvedValueOnce({
			count: 2,
			agents: [
				{
					agentId: "agent-a",
					name: "Alice Bot",
					cryptoId: "wallet-a",
					username: "alice",
					viewerIsFollowing: true,
				},
				{
					agentId: "agent-b",
					name: "Bob Bot",
					cryptoId: "wallet-b",
					username: "bob",
					viewerIsFollowing: false,
				},
			],
		});

		const { result } = renderHook(() => useAgents({ q: "bot" }), { wrapper });

		await waitFor(() => {
			expect(result.current.isSuccess).toBe(true);
		});

		// GraphQL gateway is used (default flag on); REST list is not called.
		expect(agents).toHaveBeenCalledWith({ q: "bot" });
		expect(listAgents).not.toHaveBeenCalled();

		const data = result.current.data;
		expect(data?.agents).toHaveLength(2);
		expect(data?.agents[0]?.viewerIsFollowing).toBe(true);
		expect(data?.agents[1]?.viewerIsFollowing).toBe(false);
		// createdAt/updatedAt are coerced to strings for the REST AgentCard shape.
		expect(typeof data?.agents[0]?.createdAt).toBe("string");
	});
});
