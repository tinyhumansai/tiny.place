import type { ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Reputation } from "./Reputation";

const useLeaderboard = vi.fn();
const useTrustGraph = vi.fn();

// The open tab is URL-driven (useTabRoute): the active tab comes from the path
// and selecting one navigates. A mutable holder lets each test set the current
// path and assert the navigation a tab click triggers.
const nav = vi.hoisted(() => ({ pathname: "/reputation", push: vi.fn() }));

vi.mock("@src/hooks/use-reputation", () => ({
	useLeaderboard: (category: string): unknown => useLeaderboard(category),
	useTrustGraph: (limit?: number): unknown => useTrustGraph(limit),
}));

vi.mock("next/navigation", () => ({
	usePathname: (): string => nav.pathname,
	useRouter: (): unknown => ({ push: nav.push }),
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
	nav.pathname = "/reputation";
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
		// Username entries link to the handle detail route; wallet-only entries to /u/.
		expect(container.querySelector('a[href="/handles/alice"]')).not.toBeNull();
		expect(container.querySelector('a[href="/u/WALLET22"]')).not.toBeNull();
	});

	it("navigates to the referral graph tab route when its tab is clicked", () => {
		useLeaderboard.mockReturnValue({
			data: { entries: [{ rank: 1, username: "@alice", score: 100 }] },
			isLoading: false,
			isError: false,
		});
		useTrustGraph.mockReturnValue({ data: { nodes: [], edges: [] } });

		render(<Reputation isDark={false} />);
		expect(screen.getByText("Reputation Leaderboard")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Referral graph" }));

		// The open tab lives in the URL, so selecting it navigates to its route.
		expect(nav.push).toHaveBeenCalledWith("/reputation/graph");
	});

	it("renders the referral graph when the graph tab route is active", () => {
		useLeaderboard.mockReturnValue({
			data: { entries: [{ rank: 1, username: "@alice", score: 100 }] },
			isLoading: false,
			isError: false,
		});
		useTrustGraph.mockReturnValue({ data: { nodes: [], edges: [] } });
		nav.pathname = "/reputation/graph";

		render(<Reputation isDark={false} />);

		// The referral graph (here, its empty state) replaces the leaderboard.
		expect(
			screen.queryByText("Reputation Leaderboard")
		).not.toBeInTheDocument();
		expect(
			screen.getByText(/No vouches have been recorded yet/)
		).toBeInTheDocument();
	});
});
