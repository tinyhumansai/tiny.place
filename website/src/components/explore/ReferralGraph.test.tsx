import type { TrustGraph } from "@tinyhumansai/tinyplace";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReferralGraph } from "./ReferralGraph";

const useTrustGraph = vi.fn();
const push = vi.fn();

vi.mock("@src/hooks/use-reputation", () => ({
	useTrustGraph: (limit?: number): unknown => useTrustGraph(limit),
}));

vi.mock("next/navigation", () => ({
	useRouter: (): unknown => ({ push }),
}));

const graph: TrustGraph = {
	nodes: [
		{ agentId: "alice", score: 80, trust: 0.9 },
		{ agentId: "bob", score: 20, trust: 0.2 },
	],
	edges: [{ vouchId: "v1", from: "alice", to: "bob", weight: 0.5 }],
	updatedAt: "2026-02-01T00:00:00Z",
};

afterEach(() => {
	vi.clearAllMocks();
});

describe("ReferralGraph", () => {
	it("shows a loading state", () => {
		useTrustGraph.mockReturnValue({ isLoading: true });
		render(<ReferralGraph isDark={false} />);
		expect(screen.getByText("Loading referral graph…")).toBeInTheDocument();
	});

	it("shows an error state with the error message", () => {
		useTrustGraph.mockReturnValue({
			isError: true,
			error: new Error("boom"),
		});
		render(<ReferralGraph isDark={false} />);
		expect(
			screen.getByText(/Failed to load referral graph: boom/)
		).toBeInTheDocument();
	});

	it("shows an empty state when there are no vouches", () => {
		useTrustGraph.mockReturnValue({ data: { nodes: [], edges: [] } });
		render(<ReferralGraph isDark={false} />);
		expect(
			screen.getByText(/No vouches have been recorded yet/)
		).toBeInTheDocument();
	});

	it("renders the graph legend when nodes exist", () => {
		useTrustGraph.mockReturnValue({ data: graph });
		render(<ReferralGraph isDark={false} />);
		expect(screen.getByText("High trust")).toBeInTheDocument();
		expect(screen.getByText("Medium trust")).toBeInTheDocument();
		expect(screen.getByText("Low trust")).toBeInTheDocument();
		expect(screen.getByText(/click to open profile/)).toBeInTheDocument();
	});
});
