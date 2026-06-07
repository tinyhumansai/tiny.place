import type { FunctionComponent } from "@src/common/types";

type Metric = {
	label: string;
	value: string;
	trend: string;
	isPositive: boolean;
};

type DayActivity = {
	day: string;
	height: number;
};

const metrics: Array<Metric> = [
	{ label: "Total Agents", value: "1,247", trend: "+12% this week", isPositive: true },
	{ label: "Messages Sent", value: "284K", trend: "+8% this week", isPositive: true },
	{ label: "Transactions", value: "38,491", trend: "+23% this week", isPositive: true },
	{ label: "Volume", value: "$2.4M", trend: "-3% this week", isPositive: false },
	{ label: "Active Groups", value: "342", trend: "+5% this week", isPositive: true },
	{ label: "Events Hosted", value: "89", trend: "+18% this week", isPositive: true },
];

const activityData: Array<DayActivity> = [
	{ day: "Mon", height: 60 },
	{ day: "Tue", height: 45 },
	{ day: "Wed", height: 80 },
	{ day: "Thu", height: 72 },
	{ day: "Fri", height: 90 },
	{ day: "Sat", height: 35 },
	{ day: "Sun", height: 50 },
];

type StatsMockProperties = {
	isDark: boolean;
};

export const StatsMock = ({
	isDark,
}: StatsMockProperties): FunctionComponent => {
	return (
		<div className="space-y-4">
			<div className="grid grid-cols-3 gap-3">
				{metrics.map((metric) => (
					<div
						key={metric.label}
						className={`rounded-lg border p-3 ${
							isDark
								? "border-neutral-800 bg-neutral-950"
								: "border-neutral-200 bg-neutral-50"
						}`}
					>
						<p
							className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
						>
							{metric.label}
						</p>
						<p
							className={`mt-1 text-lg font-bold ${isDark ? "text-white" : "text-black"}`}
						>
							{metric.value}
						</p>
						<p
							className={`mt-0.5 text-xs ${
								metric.isPositive ? "text-emerald-500" : "text-red-500"
							}`}
						>
							{metric.trend}
						</p>
					</div>
				))}
			</div>

			<div
				className={`rounded-lg border p-4 ${
					isDark
						? "border-neutral-800 bg-neutral-950"
						: "border-neutral-200 bg-neutral-50"
				}`}
			>
				<p
					className={`mb-4 text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
				>
					Network Activity
				</p>
				<div className="flex items-end justify-between gap-2" style={{ height: "100px" }}>
					{activityData.map((day) => (
						<div
							key={day.day}
							className="flex flex-1 flex-col items-center gap-1.5"
						>
							<div
								style={{ height: `${String(day.height)}%` }}
								className={`w-full rounded-sm ${
									isDark ? "bg-blue-500/70" : "bg-blue-500/60"
								}`}
							/>
							<span
								className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
							>
								{day.day}
							</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};
