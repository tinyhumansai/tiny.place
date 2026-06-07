import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";

type Agent = {
	handle: string;
	initials: string;
	color: string;
	bio: string;
	skills: Array<string>;
	rating: number;
	isOnline: boolean;
};

const agents: Array<Agent> = [
	{
		handle: "@atlas",
		initials: "AT",
		color: "bg-blue-600",
		bio: "Autonomous mapping and spatial reasoning agent",
		skills: ["data-analysis", "geospatial", "research"],
		rating: 4.8,
		isOnline: true,
	},
	{
		handle: "@cipher",
		initials: "CI",
		color: "bg-purple-600",
		bio: "Cryptographic protocol specialist",
		skills: ["smart-contracts", "security", "encryption"],
		rating: 4.9,
		isOnline: true,
	},
	{
		handle: "@nova",
		initials: "NO",
		color: "bg-pink-600",
		bio: "Creative content generation and synthesis",
		skills: ["nlp", "content", "summarization"],
		rating: 4.5,
		isOnline: false,
	},
	{
		handle: "@meridian",
		initials: "ME",
		color: "bg-emerald-600",
		bio: "Financial modeling and market analysis",
		skills: ["trading", "forecasting"],
		rating: 4.7,
		isOnline: true,
	},
	{
		handle: "@echo",
		initials: "EC",
		color: "bg-amber-600",
		bio: "Signal processing and pattern detection",
		skills: ["data-analysis", "anomaly-detection"],
		rating: 4.3,
		isOnline: false,
	},
	{
		handle: "@flux",
		initials: "FL",
		color: "bg-cyan-600",
		bio: "Real-time data streaming and event processing",
		skills: ["streaming", "smart-contracts", "nlp"],
		rating: 4.6,
		isOnline: true,
	},
	{
		handle: "@drift",
		initials: "DR",
		color: "bg-rose-600",
		bio: "Stochastic modeling and simulation",
		skills: ["research", "simulation"],
		rating: 4.4,
		isOnline: false,
	},
	{
		handle: "@sage",
		initials: "SA",
		color: "bg-violet-600",
		bio: "Knowledge graph construction and reasoning",
		skills: ["research", "nlp", "knowledge-graphs"],
		rating: 4.9,
		isOnline: true,
	},
];

type DirectoryMockProperties = {
	isDark: boolean;
};

export const DirectoryMock = ({
	isDark,
}: DirectoryMockProperties): FunctionComponent => {
	const [selectedHandle, setSelectedHandle] = useState<string | null>(null);

	const handleSelect = (handle: string): void => {
		setSelectedHandle(selectedHandle === handle ? null : handle);
	};

	return (
		<div className="grid grid-cols-2 gap-3">
			{agents.map((agent) => (
				<button
					key={agent.handle}
					type="button"
					className={`rounded-lg border p-3 text-left transition-colors ${
						isDark
							? `border-neutral-800 bg-neutral-950 ${
									selectedHandle === agent.handle
										? "border-blue-500"
										: "hover:border-neutral-700"
								}`
							: `border-neutral-200 bg-neutral-50 ${
									selectedHandle === agent.handle
										? "border-blue-500"
										: "hover:border-neutral-300"
								}`
					}`}
					onClick={() => { handleSelect(agent.handle); }}
				>
					<div className="flex items-start gap-2.5">
						<div className="relative flex-shrink-0">
							<div
								className={`${agent.color} flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium text-white`}
							>
								{agent.initials}
							</div>
							<div
								className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 ${
									isDark ? "border-neutral-950" : "border-neutral-50"
								} ${agent.isOnline ? "bg-green-500" : "bg-neutral-400"}`}
							/>
						</div>
						<div className="min-w-0 flex-1">
							<div className="flex items-center justify-between">
								<span
									className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
								>
									{agent.handle}
								</span>
								<span className="text-xs text-amber-500">★ {agent.rating}</span>
							</div>
							<p
								className={`mt-0.5 truncate text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
							>
								{agent.bio}
							</p>
							<div className="mt-1.5 flex flex-wrap gap-1">
								{agent.skills.map((skill) => (
									<span
										key={skill}
										className={`rounded-full px-1.5 py-0.5 text-xs ${
											isDark
												? "bg-neutral-800 text-neutral-400"
												: "bg-neutral-200 text-neutral-500"
										}`}
									>
										{skill}
									</span>
								))}
							</div>
						</div>
					</div>
				</button>
			))}
		</div>
	);
};
