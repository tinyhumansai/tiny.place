import { useState } from "react";

import type { BroadcastChannel } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { useBroadcasts } from "@src/hooks/use-broadcasts";

export const BroadcastsMock = ({
	isDark,
}: {
	isDark: boolean;
}): FunctionComponent => {
	const { data, isLoading, isError, error } = useBroadcasts();
	const broadcasts = data?.broadcasts ?? [];

	const [subscribedChannels, setSubscribedChannels] = useState<Set<string>>(
		new Set()
	);

	function toggleSubscription(broadcastId: string): void {
		setSubscribedChannels((previous) => {
			const next = new Set(previous);
			if (next.has(broadcastId)) {
				next.delete(broadcastId);
			} else {
				next.add(broadcastId);
			}
			return next;
		});
	}

	if (isLoading) {
		return (
			<div
				className={`flex h-full items-center justify-center rounded-lg border ${isDark ? "border-neutral-800 bg-neutral-950" : "border-neutral-200 bg-neutral-50"}`}
			>
				<p
					className={`text-sm ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
				>
					Loading broadcasts...
				</p>
			</div>
		);
	}

	if (isError) {
		return (
			<div
				className={`flex h-full items-center justify-center rounded-lg border ${isDark ? "border-neutral-800 bg-neutral-950" : "border-neutral-200 bg-neutral-50"}`}
			>
				<p className="text-sm text-red-500">
					Failed to load broadcasts
					{error instanceof Error ? `: ${error.message}` : ""}
				</p>
			</div>
		);
	}

	if (broadcasts.length === 0) {
		return (
			<div
				className={`flex h-full items-center justify-center rounded-lg border ${isDark ? "border-neutral-800 bg-neutral-950" : "border-neutral-200 bg-neutral-50"}`}
			>
				<p
					className={`text-sm ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
				>
					No broadcasts available
				</p>
			</div>
		);
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
					{broadcasts.map(
						(channel: BroadcastChannel): React.ReactElement => (
							<div
								key={channel.broadcastId}
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
											subscribedChannels.has(channel.broadcastId)
												? "bg-blue-500/10 text-blue-500"
												: isDark
													? "border border-neutral-800 text-neutral-500 hover:text-neutral-300"
													: "border border-neutral-200 text-neutral-400 hover:text-neutral-600"
										}`}
										onClick={(): void => {
											toggleSubscription(channel.broadcastId);
										}}
									>
										{subscribedChannels.has(channel.broadcastId)
											? "Subscribed"
											: "Subscribe"}
									</button>
								</div>
								<p
									className={`mt-1 text-[10px] ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
								>
									{channel.description ?? "No description"}
								</p>
								<p
									className={`mt-1.5 text-[10px] ${isDark ? "text-neutral-600" : "text-neutral-300"}`}
								>
									{channel.subscriberCount.toLocaleString()} subscribers
								</p>
							</div>
						)
					)}
				</div>
			</div>
		</div>
	);
};
