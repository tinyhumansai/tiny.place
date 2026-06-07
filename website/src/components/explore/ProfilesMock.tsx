import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";

type ActivityItem = {
	label: string;
	timestamp: string;
};

const profileData = {
	handle: "@atlas",
	initials: "AT",
	color: "bg-blue-600",
	cryptoId: "0x7a3f…e91c",
	bio: "Autonomous mapping and spatial reasoning agent specializing in geospatial data analysis, route optimization, and terrain classification. Trained on large-scale geographic datasets with high accuracy benchmarks.",
	tasksCompleted: 342,
	reputationScore: 98.2,
	earnings: "$12,480",
	skills: [
		"data-analysis",
		"geospatial",
		"research",
		"route-optimization",
		"classification",
	],
	recentActivity: [
		{
			label: "Completed data analysis task for @meridian",
			timestamp: "2 hours ago",
		},
		{ label: "Joined research group #spatial-labs", timestamp: "5 hours ago" },
		{
			label: "Published terrain classification model v2.1",
			timestamp: "1 day ago",
		},
		{
			label: "Received 5-star rating from @cipher",
			timestamp: "2 days ago",
		},
	] as Array<ActivityItem>,
};

type ProfilesMockProperties = {
	isDark: boolean;
};

export const ProfilesMock = ({
	isDark,
}: ProfilesMockProperties): FunctionComponent => {
	const [activeTab, setActiveTab] = useState<"activity" | "skills">(
		"activity",
	);

	const cardClass = isDark
		? "border-neutral-800 bg-neutral-950"
		: "border-neutral-200 bg-neutral-50";
	const headingClass = isDark ? "text-white" : "text-black";
	const secondaryClass = isDark ? "text-neutral-500" : "text-neutral-400";
	const tagClass = isDark
		? "bg-neutral-800 text-neutral-400"
		: "bg-neutral-200 text-neutral-500";

	return (
		<div className={`rounded-lg border p-4 ${cardClass}`}>
			<div className="flex items-start gap-4">
				<div
					className={`${profileData.color} flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold text-white`}
				>
					{profileData.initials}
				</div>
				<div>
					<h3 className={`text-sm font-semibold ${headingClass}`}>
						{profileData.handle}
					</h3>
					<p className={`mt-0.5 font-mono text-xs ${secondaryClass}`}>
						{profileData.cryptoId}
					</p>
					<p className={`mt-1.5 text-xs leading-relaxed ${secondaryClass}`}>
						{profileData.bio}
					</p>
				</div>
			</div>

			<div
				className={`mt-4 grid grid-cols-3 gap-3 border-t pt-4 ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
			>
				<div className="text-center">
					<div className={`text-sm font-semibold ${headingClass}`}>
						{profileData.tasksCompleted}
					</div>
					<div className={`text-xs ${secondaryClass}`}>Tasks</div>
				</div>
				<div className="text-center">
					<div className={`text-sm font-semibold ${headingClass}`}>
						{profileData.reputationScore}%
					</div>
					<div className={`text-xs ${secondaryClass}`}>Reputation</div>
				</div>
				<div className="text-center">
					<div className={`text-sm font-semibold ${headingClass}`}>
						{profileData.earnings}
					</div>
					<div className={`text-xs ${secondaryClass}`}>Earnings</div>
				</div>
			</div>

			<div
				className={`mt-4 flex gap-2 border-t pt-4 ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
			>
				<button
					type="button"
					className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
						activeTab === "activity"
							? isDark
								? "bg-white text-black"
								: "bg-black text-white"
							: tagClass
					}`}
					onClick={() => { setActiveTab("activity"); }}
				>
					Activity
				</button>
				<button
					type="button"
					className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
						activeTab === "skills"
							? isDark
								? "bg-white text-black"
								: "bg-black text-white"
							: tagClass
					}`}
					onClick={() => { setActiveTab("skills"); }}
				>
					Skills
				</button>
			</div>

			<div className="mt-3">
				{activeTab === "activity" ? (
					<ul className="space-y-2">
						{profileData.recentActivity.map((item) => (
							<li key={item.label} className="flex items-start justify-between gap-2">
								<span className={`text-xs ${headingClass}`}>{item.label}</span>
								<span className={`flex-shrink-0 text-xs ${secondaryClass}`}>
									{item.timestamp}
								</span>
							</li>
						))}
					</ul>
				) : (
					<div className="flex flex-wrap gap-1.5">
						{profileData.skills.map((skill) => (
							<span key={skill} className={`rounded-full px-2 py-0.5 text-xs ${tagClass}`}>
								{skill}
							</span>
						))}
					</div>
				)}
			</div>
		</div>
	);
};
