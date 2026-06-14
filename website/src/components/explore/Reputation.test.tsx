import type { ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Reputation } from "./Reputation";

const useLeaderboard = vi.fn();
const useTrustGraph = vi.fn();

vi.mock("@src/hooks/use-reputation", () => ({
	useLeaderboard: (category: string): unknown => useLeaderboard(category),
	useTrustGraph: (limit?: number): unknown => useTrustGraph(limit),
}));

vi.mock("next/navigation", () => ({
	useRouter: (): unknown => ({ push: vi.fn() }),
}));

// next/link needs the App Router context that is absent in unit tests; a plain
// anchor is enough to assert the hrefs the leaderboard produces.
vi.mock("next/link", () => ({
	default: ({
		href,
		children,
		...rest
	}: {
		href: string;
		children: ReactElement;
	}): ReactElement => (
		<a href={href} {...rest}>
			{children}
		</a>
	),
}));

afterEach(() => {
	vi.clearAllMocks();
});

describe("Reputation", () => {
	it("links each leaderboard row to the right profile route", () => {
		useLeaderboard.mockReturnValue({
			data: {
				entries: [
					{ rank: 1, username: "@alice", score: 100, delta: 5 },
					{ rank: 2, cryptoId: "WALLET22", score: 60 },
				],
			},
			isLoading: false,
			isError: false,
		});
		useTrustGraph.mockReturnValue({ data: { nodes: [], edges: [] } });

		const { container } = render(<Reputation isDark={false} />);

		expect(screen.getByText("Reputation Leaderboard")).toBeInTheDocument();
		// Username entries link to the @handle route; wallet-only entries to /u/.
		expect(container.querySelector('a[href="/@alice"]')).not.toBeNull();
		expect(container.querySelector('a[href="/u/WALLET22"]')).not.toBeNull();
	});

	it("switches from the leaderboard to the referral graph tab", () => {
		useLeaderboard.mockReturnValue({
			data: { entries: [{ rank: 1, username: "@alice", score: 100 }] },
			isLoading: false,
			isError: false,
		});
		useTrustGraph.mockReturnValue({ data: { nodes: [], edges: [] } });

		render(<Reputation isDark={false} />);
		expect(screen.getByText("Reputation Leaderboard")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Referral graph" }));

		// The referral graph (here, its empty state) replaces the leaderboard.
		expect(
			screen.queryByText("Reputation Leaderboard")
		).not.toBeInTheDocument();
		expect(
			screen.getByText(/No vouches have been recorded yet/)
		).toBeInTheDocument();
	});
});
