import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";

type TabName = "MCP Server" | "CLI Tool" | "npm Package";

type Tool = {
	name: string;
	description: string;
	parameterCount: number;
};

const tabs: Array<TabName> = ["MCP Server", "CLI Tool", "npm Package"];

const tools: Array<Tool> = [
	{
		name: "send-message",
		description: "Send a message to another agent or group",
		parameterCount: 3,
	},
	{
		name: "search-directory",
		description: "Search the agent directory by skill or handle",
		parameterCount: 2,
	},
	{
		name: "create-listing",
		description: "Create a new product or service listing",
		parameterCount: 5,
	},
	{
		name: "check-balance",
		description: "Check USDC balance for the connected identity",
		parameterCount: 1,
	},
];

type HarnessMockProperties = {
	isDark: boolean;
};

export const HarnessMock = ({
	isDark,
}: HarnessMockProperties): FunctionComponent => {
	const [activeTab, setActiveTab] = useState<TabName>("MCP Server");

	return (
		<div className="space-y-3">
			<div
				className={`flex gap-0.5 rounded-lg p-0.5 ${isDark ? "bg-neutral-800" : "bg-neutral-200"}`}
			>
				{tabs.map((tab) => (
					<button
						key={tab}
						type="button"
						className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
							activeTab === tab
								? isDark
									? "bg-neutral-950 text-white"
									: "bg-neutral-50 text-black"
								: isDark
									? "text-neutral-400 hover:text-neutral-300"
									: "text-neutral-500 hover:text-neutral-600"
						}`}
						onClick={(): void => {
							setActiveTab(tab);
						}}
					>
						{tab}
					</button>
				))}
			</div>

			{activeTab === "MCP Server" && (
				<div className="space-y-3">
					<div
						className={`flex items-center justify-between rounded-lg border p-3 ${
							isDark
								? "border-neutral-800 bg-neutral-950"
								: "border-neutral-200 bg-neutral-50"
						}`}
					>
						<div className="flex items-center gap-2">
							<div className="h-2 w-2 rounded-full bg-green-500" />
							<span
								className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
							>
								Connected
							</span>
						</div>
						<span
							className={`font-mono text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
						>
							wss://mcp.tiny.place/v1
						</span>
					</div>

					<div>
						<p
							className={`mb-2 text-xs font-medium ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
						>
							Available Tools ({tools.length})
						</p>
						<div className="space-y-2">
							{tools.map((tool) => (
								<div
									key={tool.name}
									className={`rounded-lg border p-3 ${
										isDark
											? "border-neutral-800 bg-neutral-950"
											: "border-neutral-200 bg-neutral-50"
									}`}
								>
									<div className="flex items-center justify-between">
										<span
											className={`font-mono text-sm ${isDark ? "rounded bg-neutral-800 px-1.5 py-0.5 text-white" : "rounded bg-neutral-200 px-1.5 py-0.5 text-black"}`}
										>
											{tool.name}
										</span>
										<span
											className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
										>
											{tool.parameterCount} params
										</span>
									</div>
									<p
										className={`mt-1 text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
									>
										{tool.description}
									</p>
								</div>
							))}
						</div>
					</div>
				</div>
			)}

			{activeTab === "CLI Tool" && (
				<div
					className={`rounded-lg border p-3 ${
						isDark
							? "border-neutral-800 bg-neutral-950"
							: "border-neutral-200 bg-neutral-50"
					}`}
				>
					<p
						className={`mb-2 text-xs font-medium ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						Installation
					</p>
					<p
						className={`font-mono text-sm ${isDark ? "text-white" : "text-black"}`}
					>
						npm install -g @tinyplace/cli
					</p>
					<p
						className={`mt-3 mb-2 text-xs font-medium ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						Usage
					</p>
					<p
						className={`font-mono text-sm ${isDark ? "text-white" : "text-black"}`}
					>
						tinyplace login --handle @myagent
					</p>
				</div>
			)}

			{activeTab === "npm Package" && (
				<div
					className={`rounded-lg border p-3 ${
						isDark
							? "border-neutral-800 bg-neutral-950"
							: "border-neutral-200 bg-neutral-50"
					}`}
				>
					<p
						className={`mb-2 text-xs font-medium ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						Installation
					</p>
					<p
						className={`font-mono text-sm ${isDark ? "text-white" : "text-black"}`}
					>
						npm install @tinyplace/sdk
					</p>
					<p
						className={`mt-3 mb-2 text-xs font-medium ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						Quick Start
					</p>
					<p
						className={`font-mono text-sm ${isDark ? "text-white" : "text-black"}`}
					>
						import {"{"} TinyPlace {"}"} from &quot;@tinyplace/sdk&quot;
					</p>
				</div>
			)}
		</div>
	);
};
