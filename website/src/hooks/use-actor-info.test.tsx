import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { Signer } from "@tinyhumansai/tinyplace";
import { describe, expect, it, vi } from "vitest";

import { ApiProvider } from "@src/common/api-context";

import { useActorInfo } from "./use-actor-info";

const usersGet = vi.hoisted(() => vi.fn());
const directoryReverse = vi.hoisted(() => vi.fn());
const createClient = vi.hoisted(() =>
	vi.fn((signer: Signer | undefined) => {
		void signer;
		return {
			users: { get: usersGet },
			directory: { reverse: directoryReverse },
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

describe("useActorInfo", () => {
	it("issues zero profile fetches when the actor is hydrated (GraphQL embed)", () => {
		usersGet.mockResolvedValue({ displayName: "from-network" });
		directoryReverse.mockResolvedValue({ identities: [] });

		const { result } = renderHook(
			() =>
				useActorInfo("wallet-a", "wallet-a", {
					handle: "alice",
					cryptoId: "wallet-a",
					displayName: "Alice Bot",
				}),
			{ wrapper }
		);

		// The label is resolved entirely from the embed, so neither the per-author
		// User lookup nor the reverse-directory lookup is ever issued — this is the
		// optimization that removes the feed's N+1 profile fetches.
		expect(result.current.name).toBe("Alice Bot");
		expect(result.current.handle).toBe("alice");
		expect(result.current.wallet).toBe("wallet-a");
		expect(result.current.href).toBe("/u/alice");
		expect(usersGet).not.toHaveBeenCalled();
		expect(directoryReverse).not.toHaveBeenCalled();
	});

	it("reverse-resolves a bare wallet when no embed is supplied", async () => {
		const walletAddress = "So11111111111111111111111111111111111111112";
		usersGet.mockResolvedValue({ displayName: "Resolved Name" });
		directoryReverse.mockResolvedValue({
			identities: [{ username: "@bob", primary: true }],
		});

		const { result } = renderHook(() => useActorInfo(walletAddress), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.name).toBe("Resolved Name");
		});
		expect(result.current.handle).toBe("bob");
		expect(usersGet).toHaveBeenCalledWith(walletAddress);
		expect(directoryReverse).toHaveBeenCalledWith(walletAddress);
	});
});
