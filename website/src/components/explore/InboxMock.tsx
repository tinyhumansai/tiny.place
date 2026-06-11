import { useState } from "react";

import type { InboxItem, InboxType } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { useInbox } from "@src/hooks/use-inbox";

const filterOptions = ["All", "Tasks", "Payments", "Invites"] as const;

type Filter = (typeof filterOptions)[number];

const typeColorMap: Record<InboxType, string> = {
	TASK_REQUEST: "bg-blue-500",
	TASK_UPDATE: "bg-blue-400",
	PAYMENT_RECEIVED: "bg-green-500",
	PAYMENT_REQUIRED: "bg-green-400",
	GROUP_INVITE: "bg-purple-500",
	GROUP_MESSAGE: "bg-purple-400",
	IDENTITY_TRANSFER: "bg-orange-500",
	OFFER_RECEIVED: "bg-teal-500",
	SUBSCRIPTION_EVENT: "bg-indigo-500",
	SYSTEM: "bg-yellow-500",
};

const filterTypeMap: Record<Filter, Array<InboxType> | null> = {
	All: null,
	Tasks: ["TASK_REQUEST", "TASK_UPDATE"],
	Payments: ["PAYMENT_RECEIVED", "PAYMENT_REQUIRED"],
	Invites: ["GROUP_INVITE"],
};

function formatTimestamp(timestamp: string): string {
	const date = new Date(timestamp);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMinutes = Math.floor(diffMs / 60_000);
	const diffHours = Math.floor(diffMs / 3_600_000);
	const diffDays = Math.floor(diffMs / 86_400_000);

	if (diffMinutes < 1) return "just now";
	if (diffMinutes < 60) return `${diffMinutes}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	return `${diffDays}d ago`;
}

function matchesFilter(item: InboxItem, filter: Filter): boolean {
	const allowedTypes = filterTypeMap[filter];
	if (allowedTypes === null) return true;
	return allowedTypes.includes(item.type);
}

export const InboxMock = ({
	isDark,
}: {
	isDark: boolean;
}): FunctionComponent => {
	const [activeFilter, setActiveFilter] = useState<Filter>("All");
	const { data, isLoading, isError, error } = useInbox();

	const isAuthError =
		isError &&
		error !== null &&
		"status" in error &&
		(error as { status: number }).status === 401;

	if (isAuthError) {
		return (
			<div
				className={`flex h-full flex-col items-center justify-center overflow-hidden rounded-lg border ${isDark ? "border-neutral-800 bg-neutral-950" : "border-neutral-200 bg-neutral-50"}`}
			>
				<p
					className={`text-sm ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
				>
					Connect your wallet to view your inbox
				</p>
			</div>
		);
	}

	if (isError) {
		return (
			<div
				className={`flex h-full flex-col items-center justify-center overflow-hidden rounded-lg border ${isDark ? "border-neutral-800 bg-neutral-950" : "border-neutral-200 bg-neutral-50"}`}
			>
				<p
					className={`text-sm ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
				>
					Failed to load inbox
				</p>
			</div>
		);
	}

	const items = data?.items ?? [];
	const unreadCount = data?.unreadCount ?? 0;

	const filteredItems = items.filter((item): boolean =>
		matchesFilter(item, activeFilter),
	);

	return (
		<div
			className={`flex h-full flex-col overflow-hidden rounded-lg border ${isDark ? "border-neutral-800 bg-neutral-950" : "border-neutral-200 bg-neutral-50"}`}
		>
			<div
				className={`flex items-center justify-between border-b px-4 py-3 ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
			>
				<span
					className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
				>
					Inbox
					{unreadCount > 0 && (
						<span className="ml-2 inline-flex items-center justify-center rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
							{unreadCount}
						</span>
					)}
				</span>
				<div className="flex gap-1">
					{filterOptions.map(
						(filter): React.ReactElement => (
							<button
								key={filter}
								type="button"
								className={`rounded-md px-2 py-1 text-[10px] font-medium ${
									activeFilter === filter
										? "bg-blue-500 text-white"
										: isDark
											? "text-neutral-500 hover:text-neutral-300"
											: "text-neutral-400 hover:text-neutral-600"
								}`}
								onClick={(): void => {
									setActiveFilter(filter);
								}}
							>
								{filter}
							</button>
						),
					)}
				</div>
			</div>

			<div className="flex-1 overflow-y-auto">
				{isLoading && (
					<div className="flex items-center justify-center py-8">
						<p
							className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
						>
							Loading...
						</p>
					</div>
				)}

				{!isLoading && filteredItems.length === 0 && (
					<div className="flex items-center justify-center py-8">
						<p
							className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
						>
							No items in your inbox
						</p>
					</div>
				)}

				{filteredItems.map(
					(item): React.ReactElement => (
						<div
							key={item.itemId}
							className={`flex items-start gap-3 border-b px-4 py-3 ${isDark ? "border-neutral-800/50" : "border-neutral-200/50"} ${
								item.status === "unread"
									? isDark
										? "bg-neutral-900/50"
										: "bg-blue-50/50"
									: ""
							}`}
						>
							<div
								className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${typeColorMap[item.type]}`}
							/>
							<div className="min-w-0 flex-1">
								<p
									className={`text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
								>
									{item.subject}
								</p>
								<p
									className={`text-[10px] ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
								>
									{item.summary ?? ""}
								</p>
								<p
									className={`mt-1 text-[10px] ${isDark ? "text-neutral-600" : "text-neutral-300"}`}
								>
									{formatTimestamp(item.timestamp)}
								</p>
							</div>
							{item.actions && item.actions.length > 0 && (
								<div className="flex shrink-0 gap-1">
									{item.actions.map(
										(action): React.ReactElement => (
											<button
												key={action}
												type="button"
												className={`rounded-md px-2 py-1 text-[10px] font-medium ${
													action === "Decline"
														? isDark
															? "text-neutral-500 hover:text-neutral-300"
															: "text-neutral-400 hover:text-neutral-600"
														: "bg-blue-500/10 text-blue-500"
												}`}
											>
												{action}
											</button>
										),
									)}
								</div>
							)}
						</div>
					),
				)}
			</div>
		</div>
	);
};
