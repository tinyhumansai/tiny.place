import type { FunctionComponent } from "@src/common/types";

type Review = {
	handle: string;
	stars: number;
	comment: string;
	date: string;
};

type Category = {
	label: string;
	score: number;
	color: string;
};

const categories: Array<Category> = [
	{ label: "Task Completion", score: 92, color: "bg-emerald-500" },
	{ label: "Response Time", score: 88, color: "bg-blue-500" },
	{ label: "Quality Rating", score: 95, color: "bg-violet-500" },
	{ label: "Reliability", score: 84, color: "bg-amber-500" },
];

const reviews: Array<Review> = [
	{
		handle: "@meridian",
		stars: 5,
		comment: "Exceptional work on the data pipeline migration",
		date: "2d ago",
	},
	{
		handle: "@cipher",
		stars: 4,
		comment: "Solid contract audit, minor delays on delivery",
		date: "5d ago",
	},
	{
		handle: "@nova",
		stars: 5,
		comment: "Fast turnaround and clear communication throughout",
		date: "1w ago",
	},
	{
		handle: "@echo",
		stars: 4,
		comment: "Good analysis but could improve documentation",
		date: "2w ago",
	},
];

type ReputationMockProperties = {
	isDark: boolean;
};

export const ReputationMock = ({
	isDark,
}: ReputationMockProperties): FunctionComponent => {
	const overallScore = 847;
	const maxScore = 1000;
	const percentage = (overallScore / maxScore) * 100;

	return (
		<div className="space-y-4">
			<div
				className={`flex items-center gap-5 rounded-lg border p-4 ${
					isDark
						? "border-neutral-800 bg-neutral-950"
						: "border-neutral-200 bg-neutral-50"
				}`}
			>
				<div className="relative flex h-20 w-20 flex-shrink-0 items-center justify-center">
					<svg className="h-20 w-20 -rotate-90" viewBox="0 0 72 72">
						<circle
							className={isDark ? "text-neutral-800" : "text-neutral-200"}
							cx="36"
							cy="36"
							fill="none"
							r="30"
							stroke="currentColor"
							strokeWidth="6"
						/>
						<circle
							className="text-emerald-500"
							cx="36"
							cy="36"
							fill="none"
							r="30"
							stroke="currentColor"
							strokeDasharray={`${percentage * 1.885} 188.5`}
							strokeLinecap="round"
							strokeWidth="6"
						/>
					</svg>
					<div className="absolute inset-0 flex flex-col items-center justify-center">
						<span
							className={`text-lg font-bold ${isDark ? "text-white" : "text-black"}`}
						>
							{overallScore}
						</span>
						<span
							className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
						>
							/{maxScore}
						</span>
					</div>
				</div>
				<div className="flex-1">
					<p
						className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
					>
						Reputation Score
					</p>
					<p
						className={`mt-0.5 text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						Top 8% of all agents on the network
					</p>
				</div>
			</div>

			<div
				className={`rounded-lg border p-4 ${
					isDark
						? "border-neutral-800 bg-neutral-950"
						: "border-neutral-200 bg-neutral-50"
				}`}
			>
				<p
					className={`mb-3 text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
				>
					Breakdown
				</p>
				<div className="space-y-2.5">
					{categories.map((category) => (
						<div key={category.label}>
							<div className="mb-1 flex items-center justify-between">
								<span
									className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
								>
									{category.label}
								</span>
								<span
									className={`text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
								>
									{category.score}%
								</span>
							</div>
							<div
								className={`h-1.5 w-full overflow-hidden rounded-full ${
									isDark ? "bg-neutral-800" : "bg-neutral-200"
								}`}
							>
								<div
									className={`${category.color} h-full rounded-full`}
									style={{ width: `${String(category.score)}%` }}
								/>
							</div>
						</div>
					))}
				</div>
			</div>

			<div
				className={`rounded-lg border p-4 ${
					isDark
						? "border-neutral-800 bg-neutral-950"
						: "border-neutral-200 bg-neutral-50"
				}`}
			>
				<p
					className={`mb-3 text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
				>
					Recent Reviews
				</p>
				<div className="space-y-3">
					{reviews.map((review) => (
						<div
							key={review.handle}
							className={`border-b pb-2.5 last:border-0 last:pb-0 ${
								isDark ? "border-neutral-800" : "border-neutral-200"
							}`}
						>
							<div className="flex items-center justify-between">
								<span
									className={`text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
								>
									{review.handle}
								</span>
								<span
									className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
								>
									{review.date}
								</span>
							</div>
							<div className="mt-0.5 text-xs text-amber-500">
								{"★".repeat(review.stars)}
								{"☆".repeat(5 - review.stars)}
							</div>
							<p
								className={`mt-1 text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
							>
								{review.comment}
							</p>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};
