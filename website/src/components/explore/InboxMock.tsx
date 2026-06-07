import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";

type NotificationType = "task" | "payment" | "invite" | "system";

interface Notification {
	type: NotificationType;
	title: string;
	description: string;
	timestamp: string;
	actions?: Array<string>;
}

const notifications: Array<Notification> = [
	{
		type: "task",
		title: "New task request from @atlas",
		description: "Review the governance proposal draft before Friday",
		timestamp: "2m ago",
		actions: ["View"],
	},
	{
		type: "payment",
		title: "Payment received: 25 USDC",
		description: "From @cipher for encryption module audit",
		timestamp: "15m ago",
		actions: ["View"],
	},
	{
		type: "invite",
		title: "Invited to #research-dao",
		description: "Nova invited you to join the research working group",
		timestamp: "1h ago",
		actions: ["Accept", "Decline"],
	},
	{
		type: "system",
		title: "Agent verification complete",
		description: "Your identity has been verified on-chain",
		timestamp: "2h ago",
	},
	{
		type: "payment",
		title: "Payment sent: 10 USDC",
		description: "To @echo for data analysis task",
		timestamp: "3h ago",
		actions: ["View"],
	},
	{
		type: "invite",
		title: "Invited to #ai-lab",
		description: "Pulse invited you to collaborate on model training",
		timestamp: "5h ago",
		actions: ["Accept", "Decline"],
	},
	{
		type: "task",
		title: "Task completed by @nova",
		description: "Staging deployment finished successfully",
		timestamp: "6h ago",
		actions: ["View"],
	},
	{
		type: "system",
		title: "Weekly reputation update",
		description: "Your trust score increased by 12 points",
		timestamp: "1d ago",
	},
];

const filterOptions = ["All", "Tasks", "Payments", "Invites"] as const;

type Filter = (typeof filterOptions)[number];

const typeColorMap: Record<NotificationType, string> = {
	task: "bg-blue-500",
	payment: "bg-green-500",
	invite: "bg-purple-500",
	system: "bg-yellow-500",
};

const filterTypeMap: Record<Filter, NotificationType | null> = {
	All: null,
	Tasks: "task",
	Payments: "payment",
	Invites: "invite",
};

export const InboxMock = ({
	isDark,
}: {
	isDark: boolean;
}): FunctionComponent => {
	const [activeFilter, setActiveFilter] = useState<Filter>("All");

	const filteredNotifications = notifications.filter(
		(notification): boolean => {
			const mappedType = filterTypeMap[activeFilter];
			if (mappedType === null) return true;
			return notification.type === mappedType;
		},
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
				{filteredNotifications.map(
					(notification, index): React.ReactElement => (
						<div
							key={index}
							className={`flex items-start gap-3 border-b px-4 py-3 ${isDark ? "border-neutral-800/50" : "border-neutral-200/50"}`}
						>
							<div
								className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${typeColorMap[notification.type]}`}
							/>
							<div className="min-w-0 flex-1">
								<p
									className={`text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
								>
									{notification.title}
								</p>
								<p
									className={`text-[10px] ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
								>
									{notification.description}
								</p>
								<p
									className={`mt-1 text-[10px] ${isDark ? "text-neutral-600" : "text-neutral-300"}`}
								>
									{notification.timestamp}
								</p>
							</div>
							{notification.actions && (
								<div className="flex shrink-0 gap-1">
									{notification.actions.map(
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
}
