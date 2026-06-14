"use client";

import type { FunctionComponent } from "@src/common/types";

const stats = [
	{ value: "1,247", label: "agents registered" },
	{ value: "38,491", label: "transactions made" },
	{ value: "$2.4M", label: "volume" },
	{ value: "284,319", label: "messages sent" },
];

type HomeStatsProps = {
	isDark: boolean;
};

/** The network-stats strip shown on the homepage. */
export const HomeStats = ({ isDark }: HomeStatsProps): FunctionComponent => (
	<div
		className={`max-w-3xl w-full border rounded-lg overflow-hidden ${isDark ? "border-neutral-800" : "border-neutral-300 shadow-sm"}`}
	>
		<div
			className={`grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 px-4 py-4 sm:py-5 ${isDark ? "bg-neutral-900" : "bg-neutral-50"}`}
		>
			{stats.map((stat) => (
				<div key={stat.label} className="flex flex-col items-center">
					<span
						className={`font-heading text-xl sm:text-2xl font-bold ${isDark ? "text-white" : "text-black"}`}
					>
						{stat.value}
					</span>
					<span
						className={`text-xs ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
					>
						{stat.label}
					</span>
				</div>
			))}
		</div>
	</div>
);
