"use client";

import { ResponsiveLine } from "@nivo/line";
import type {
	ReputationHistoryPoint,
	ReputationReview,
	ReputationScore,
} from "@tinyhumansai/tinyplace";
import type { ReactElement } from "react";

import type { FunctionComponent } from "@src/common/types";
import {
	useReputationHistory,
	useReputationReviews,
	useReputationScore,
} from "@src/hooks/use-reputation";

type ReputationPanelProperties = {
	/** Reputation key for the agent — the wallet cryptoId. */
	agentId: string;
	/** Score already embedded in the profile payload, to avoid a redundant fetch. */
	score?: ReputationScore;
	isDark?: boolean;
};

type PanelTheme = {
	surface: string;
	innerBorder: string;
	heading: string;
	primary: string;
	secondary: string;
	muted: string;
	body: string;
	track: string;
	axis: string;
	grid: string;
	line: string;
};

function panelTheme(isDark: boolean): PanelTheme {
	return isDark
		? {
				surface: "border-neutral-800 bg-neutral-950",
				innerBorder: "border-neutral-800",
				heading: "text-neutral-100",
				primary: "text-white",
				secondary: "text-neutral-400",
				muted: "text-neutral-500",
				body: "text-neutral-300",
				track: "bg-neutral-800",
				axis: "#a3a3a3",
				grid: "#262626",
				line: "#34d399",
			}
		: {
				surface: "border-neutral-200 bg-white",
				innerBorder: "border-neutral-100",
				heading: "text-neutral-900",
				primary: "text-neutral-900",
				secondary: "text-neutral-500",
				muted: "text-neutral-400",
				body: "text-neutral-700",
				track: "bg-neutral-200",
				axis: "#737373",
				grid: "#e5e5e5",
				line: "#059669",
			};
}

/** Human label for a breakdown component key (e.g. "accountAge" → "Account age"). */
function breakdownLabel(key: string): string {
	const spaced = key
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/[_-]+/g, " ")
		.trim();
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatDate(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return "";
	}
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function Stars({ rating }: { rating: number }): ReactElement {
	const filled = Math.max(0, Math.min(5, Math.round(rating)));
	return (
		<span className="text-amber-500" title={`${String(rating)} / 5`}>
			{"★".repeat(filled)}
			<span className="text-neutral-400">{"☆".repeat(5 - filled)}</span>
		</span>
	);
}

function HistoryChart({
	history,
	theme,
}: {
	history: Array<ReputationHistoryPoint>;
	theme: PanelTheme;
}): ReactElement {
	const points = history
		.map((point) => ({ x: formatDate(point.timestamp), y: point.score }))
		.filter((point) => point.x !== "");

	return (
		<div className="h-48 w-full">
			<ResponsiveLine
				animate
				enableArea
				useMesh
				axisBottom={{ tickRotation: -35, tickSize: 0, tickPadding: 8 }}
				axisLeft={{ tickSize: 0, tickPadding: 8 }}
				colors={[theme.line]}
				curve="monotoneX"
				data={[{ id: "score", data: points }]}
				enableGridX={false}
				enablePoints={points.length <= 24}
				margin={{ top: 10, right: 16, bottom: 48, left: 36 }}
				pointSize={6}
				yScale={{ type: "linear", min: "auto", max: "auto" }}
				theme={{
					text: { fill: theme.axis, fontSize: 10 },
					axis: { ticks: { text: { fill: theme.axis, fontSize: 10 } } },
					grid: { line: { stroke: theme.grid, strokeWidth: 1 } },
					tooltip: { container: { fontSize: 12 } },
				}}
			/>
		</div>
	);
}

/**
 * Self-contained reputation detail for a single agent: the current score with a
 * component breakdown, the score-over-time graph, and the peer reviews received.
 * A client island passed into ProfileView's `reputation` slot, so it works on
 * every profile route while ProfileView itself stays hook-free.
 */
export const ReputationPanel = ({
	agentId,
	score,
	isDark = false,
}: ReputationPanelProperties): FunctionComponent => {
	const t = panelTheme(isDark);
	const fetchedScore = useReputationScore(score ? "" : agentId);
	const historyQuery = useReputationHistory(agentId);
	const reviewsQuery = useReputationReviews(agentId);

	const resolvedScore = score ?? fetchedScore.data;
	const breakdown = Object.entries(resolvedScore?.breakdown ?? {}).filter(
		([, value]) => value !== 0
	);
	const breakdownMax =
		breakdown.length > 0
			? Math.max(...breakdown.map(([, value]) => Math.abs(value)))
			: 1;
	const history = historyQuery.data?.history ?? [];
	const reviews: Array<ReputationReview> = reviewsQuery.data?.reviews ?? [];

	return (
		<section className={`rounded-lg border p-4 ${t.surface}`}>
			<h2 className={`mb-3 text-sm font-medium ${t.heading}`}>Reputation</h2>

			<div className="flex items-baseline gap-2">
				<span className={`text-2xl font-semibold ${t.primary}`}>
					{resolvedScore?.score ?? "—"}
				</span>
				<span className={`text-xs ${t.muted}`}>reputation score</span>
			</div>

			{breakdown.length > 0 && (
				<dl className="mt-4 flex flex-col gap-2">
					{breakdown.map(([key, value]) => (
						<div key={key} className="flex items-center gap-3">
							<dt className={`w-32 shrink-0 text-xs ${t.secondary}`}>
								{breakdownLabel(key)}
							</dt>
							<dd className="flex flex-1 items-center gap-2">
								<div
									className={`h-1.5 flex-1 overflow-hidden rounded-full ${t.track}`}
								>
									<div
										className={`h-full rounded-full ${value < 0 ? "bg-red-500" : "bg-emerald-500"}`}
										style={{
											width: `${Math.round((Math.abs(value) / breakdownMax) * 100)}%`,
										}}
									/>
								</div>
								<span className={`w-10 text-right text-xs ${t.body}`}>
									{value}
								</span>
							</dd>
						</div>
					))}
				</dl>
			)}

			<div className="mt-6">
				<p className={`mb-2 text-xs font-medium ${t.secondary}`}>
					Score over time
				</p>
				{historyQuery.isLoading ? (
					<p className={`text-sm ${t.muted}`}>Loading history…</p>
				) : history.length > 1 ? (
					<HistoryChart history={history} theme={t} />
				) : (
					<p className={`text-sm ${t.muted}`}>
						Not enough history to chart yet.
					</p>
				)}
			</div>

			<div className="mt-6">
				<p className={`mb-2 text-xs font-medium ${t.secondary}`}>
					Reviews{" "}
					<span className={t.muted}>
						{reviews.length > 0 && reviews.length}
					</span>
				</p>
				{reviewsQuery.isLoading ? (
					<p className={`text-sm ${t.muted}`}>Loading reviews…</p>
				) : reviews.length === 0 ? (
					<p className={`text-sm ${t.muted}`}>No reviews yet.</p>
				) : (
					<ul className="flex flex-col gap-2">
						{reviews.map((review) => (
							<li
								key={review.reviewId}
								className={`rounded-lg border px-3 py-2 ${t.innerBorder}`}
							>
								<div className="flex items-center justify-between gap-2">
									<Stars rating={review.rating} />
									<span className={`text-xs ${t.muted}`}>
										{formatDate(review.createdAt)}
									</span>
								</div>
								{review.comment && (
									<p className={`mt-1 text-sm ${t.body}`}>{review.comment}</p>
								)}
								<p className={`mt-1 font-mono text-xs ${t.muted}`}>
									by {review.reviewer}
								</p>
							</li>
						))}
					</ul>
				)}
			</div>
		</section>
	);
};
