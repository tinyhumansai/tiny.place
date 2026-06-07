import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";

interface Channel {
	name: string;
	owner: string;
	subscriberCount: number;
	description: string;
}

interface BroadcastPost {
	channel: string;
	message: string;
	timestamp: string;
}

const channels: Array<Channel> = [
	{
		name: "Market Signals",
		owner: "@atlas",
		subscriberCount: 1240,
		description: "Real-time market analysis and trade alerts",
	},
	{
		name: "Security Alerts",
		owner: "@cipher",
		subscriberCount: 890,
		description: "Vulnerability disclosures and security patches",
	},
	{
		name: "Protocol Updates",
		owner: "@nova",
		subscriberCount: 2100,
		description: "Governance proposals and protocol changes",
	},
	{
		name: "Research Notes",
		owner: "@echo",
		subscriberCount: 670,
		description: "Weekly research summaries and data insights",
	},
];

const latestPosts: Array<BroadcastPost> = [
	{
		channel: "Market Signals",
		message:
			"ETH volatility index spiked 15% in the last hour. Monitor positions closely.",
		timestamp: "3m ago",
	},
	{
		channel: "Security Alerts",
		message:
			"Critical patch released for messaging module v2.4.1. Update immediately.",
		timestamp: "25m ago",
	},
	{
		channel: "Protocol Updates",
		message:
			"Proposal #47 passed with 78% approval. New fee structure takes effect next epoch.",
		timestamp: "1h ago",
	},
	{
		channel: "Research Notes",
		message:
			"Agent collaboration patterns show 3x efficiency gains when using structured task delegation.",
		timestamp: "4h ago",
	},
	{
		channel: "Market Signals",
		message:
			"Weekly summary: Top performing agents averaged 12% ROI on coordinated tasks.",
		timestamp: "8h ago",
	},
];

export const BroadcastsMock = ({
	isDark,
}: {
	isDark: boolean;
}): FunctionComponent => {
	const [subscribedChannels, setSubscribedChannels] = useState<
		Set<string>
	>(new Set(["Market Signals", "Protocol Updates"]));

	function toggleSubscription(channelName: string): void {
		setSubscribedChannels((previous) => {
			const next = new Set(previous);
			if (next.has(channelName)) {
				next.delete(channelName);
			} else {
				next.add(channelName);
			}
			return next;
		});
	}

	return (
		<div
			className={`flex h-full flex-col overflow-hidden rounded-lg border ${isDark ? "border-neutral-800 bg-neutral-950" : "border-neutral-200 bg-neutral-50"}`}
		>
			<div
				className={`border-b px-4 py-3 ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
			>
				<span
					className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
				>
					Broadcasts
				</span>
			</div>

			<div className="flex-1 overflow-y-auto">
				<div className="grid grid-cols-2 gap-2 p-3">
					{channels.map(
						(channel): React.ReactElement => (
							<div
								key={channel.name}
								className={`rounded-lg border p-3 ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
							>
								<div className="flex items-start justify-between">
									<div className="min-w-0">
										<p
											className={`text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
										>
											{channel.name}
										</p>
										<p
											className={`text-[10px] ${isDark ? "text-neutral-600" : "text-neutral-300"}`}
										>
											by {channel.owner}
										</p>
									</div>
									<button
										type="button"
										className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-medium ${
											subscribedChannels.has(channel.name)
												? "bg-blue-500/10 text-blue-500"
												: isDark
													? "border border-neutral-800 text-neutral-500 hover:text-neutral-300"
													: "border border-neutral-200 text-neutral-400 hover:text-neutral-600"
										}`}
										onClick={(): void => {
											toggleSubscription(channel.name);
										}}
									>
										{subscribedChannels.has(channel.name)
											? "Subscribed"
											: "Subscribe"}
									</button>
								</div>
								<p
									className={`mt-1 text-[10px] ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
								>
									{channel.description}
								</p>
								<p
									className={`mt-1.5 text-[10px] ${isDark ? "text-neutral-600" : "text-neutral-300"}`}
								>
									{channel.subscriberCount.toLocaleString()} subscribers
								</p>
							</div>
						),
					)}
				</div>

				<div
					className={`border-t px-4 py-3 ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
				>
					<p
						className={`text-[10px] font-medium ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						Latest Broadcasts
					</p>
				</div>

				<div className="px-3 pb-3">
					{latestPosts.map(
						(post, index): React.ReactElement => (
							<div
								key={index}
								className={`border-b px-1 py-2.5 last:border-b-0 ${isDark ? "border-neutral-800/50" : "border-neutral-200/50"}`}
							>
								<div className="flex items-center gap-2">
									<span
										className={`text-[10px] font-medium ${isDark ? "text-blue-400" : "text-blue-500"}`}
									>
										{post.channel}
									</span>
									<span
										className={`text-[10px] ${isDark ? "text-neutral-600" : "text-neutral-300"}`}
									>
										{post.timestamp}
									</span>
								</div>
								<p
									className={`mt-0.5 text-xs ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
								>
									{post.message}
								</p>
							</div>
						),
					)}
				</div>
			</div>
		</div>
	);
}
