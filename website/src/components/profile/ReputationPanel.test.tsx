import type {
	ReputationHistoryPoint,
	ReputationReview,
	ReputationScore,
} from "@tinyhumansai/tinyplace";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReputationPanel } from "./ReputationPanel";

const useReputationScore = vi.fn();
const useReputationHistory = vi.fn();
const useReputationReviews = vi.fn();

vi.mock("@src/hooks/use-reputation", () => ({
	useReputationScore: (agentId: string): unknown => useReputationScore(agentId),
	useReputationHistory: (agentId: string): unknown =>
		useReputationHistory(agentId),
	useReputationReviews: (agentId: string): unknown =>
		useReputationReviews(agentId),
}));

function score(breakdown: Record<string, number>): ReputationScore {
	return {
		agentId: "wallet-1",
		score: 42,
		breakdown,
		updatedAt: "2026-02-01T00:00:00Z",
	};
}

function historyResult(points: Array<ReputationHistoryPoint>): unknown {
	return { data: { history: points }, isLoading: false };
}

function reviewsResult(reviews: Array<ReputationReview>): unknown {
	return { data: { reviews }, isLoading: false };
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("ReputationPanel", () => {
	it("renders the score, non-zero breakdown, history chart and reviews", () => {
		useReputationScore.mockReturnValue({ data: undefined });
		useReputationHistory.mockReturnValue(
			historyResult([
				{ timestamp: "2026-01-01T00:00:00Z", score: 10 },
				{ timestamp: "2026-02-01T00:00:00Z", score: 42 },
			])
		);
		useReputationReviews.mockReturnValue(
			reviewsResult([
				{
					reviewId: "rev-1",
					reviewer: "@bob",
					subject: "wallet-1",
					rating: 4,
					comment: "Reliable counterparty.",
					transactionRef: "tx-1",
					createdAt: "2026-02-02T00:00:00Z",
				},
			])
		);

		render(
			<ReputationPanel
				agentId="wallet-1"
				score={score({ transactions: 30, attestations: -5 })}
			/>
		);

		// Score and breakdown component labels.
		expect(screen.getByText("42")).toBeInTheDocument();
		expect(screen.getByText("Transactions")).toBeInTheDocument();
		expect(screen.getByText("Attestations")).toBeInTheDocument();
		// History section renders (2 points → charted, not the fallback copy).
		expect(screen.getByText("Score over time")).toBeInTheDocument();
		expect(
			screen.queryByText("Not enough history to chart yet.")
		).not.toBeInTheDocument();
		// Review content + star rating.
		expect(screen.getByText("Reliable counterparty.")).toBeInTheDocument();
		expect(screen.getByText("by @bob")).toBeInTheDocument();
		expect(screen.getByTitle("4 / 5")).toBeInTheDocument();
	});

	it("uses the embedded score and skips fetching its own", () => {
		useReputationScore.mockReturnValue({ data: undefined });
		useReputationHistory.mockReturnValue(historyResult([]));
		useReputationReviews.mockReturnValue(reviewsResult([]));

		render(<ReputationPanel agentId="wallet-1" score={score({})} />);

		// When a score is supplied, the score hook is invoked with the empty id
		// (its query is disabled) rather than the agent id.
		expect(useReputationScore).toHaveBeenCalledWith("");
		expect(screen.getByText("42")).toBeInTheDocument();
	});

	it("shows empty states when there is no history or reviews", () => {
		useReputationScore.mockReturnValue({ data: undefined });
		useReputationHistory.mockReturnValue(historyResult([]));
		useReputationReviews.mockReturnValue(reviewsResult([]));

		render(<ReputationPanel agentId="wallet-1" score={score({})} />);

		expect(
			screen.getByText("Not enough history to chart yet.")
		).toBeInTheDocument();
		expect(screen.getByText("No reviews yet.")).toBeInTheDocument();
	});
});
