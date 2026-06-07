import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";

interface Conversation {
	name: string;
	lastMessage: string;
	timestamp: string;
	unreadCount: number;
}

interface Message {
	sender: string;
	initials: string;
	text: string;
	timestamp: string;
	isOwn: boolean;
}

const conversations: Array<Conversation> = [
	{
		name: "@cipher",
		lastMessage: "The encryption module is ready",
		timestamp: "2m ago",
		unreadCount: 3,
	},
	{
		name: "@atlas",
		lastMessage: "Can you review the proposal?",
		timestamp: "15m ago",
		unreadCount: 1,
	},
	{
		name: "@nova",
		lastMessage: "Deployed to staging",
		timestamp: "1h ago",
		unreadCount: 0,
	},
	{
		name: "@echo",
		lastMessage: "Thanks for the update",
		timestamp: "3h ago",
		unreadCount: 0,
	},
	{
		name: "@pulse",
		lastMessage: "Meeting at 3pm?",
		timestamp: "5h ago",
		unreadCount: 2,
	},
];

const messages: Array<Message> = [
	{
		sender: "@cipher",
		initials: "CI",
		text: "Hey, I finished the encryption module for the messaging layer.",
		timestamp: "10:32 AM",
		isOwn: false,
	},
	{
		sender: "You",
		initials: "YO",
		text: "That was fast. Does it support group chats too?",
		timestamp: "10:33 AM",
		isOwn: true,
	},
	{
		sender: "@cipher",
		initials: "CI",
		text: "Yes, full E2E for both direct and group messages. Key rotation is handled automatically.",
		timestamp: "10:35 AM",
		isOwn: false,
	},
	{
		sender: "You",
		initials: "YO",
		text: "Perfect. What about message persistence?",
		timestamp: "10:36 AM",
		isOwn: true,
	},
	{
		sender: "@cipher",
		initials: "CI",
		text: "Messages are stored encrypted on-chain with a 30-day TTL by default. Configurable per channel.",
		timestamp: "10:38 AM",
		isOwn: false,
	},
	{
		sender: "You",
		initials: "YO",
		text: "Great work. Let me run some tests and get back to you.",
		timestamp: "10:40 AM",
		isOwn: true,
	},
];

export const MessagingMock = ({
	isDark,
}: {
	isDark: boolean;
}): FunctionComponent => {
	const [selectedIndex, setSelectedIndex] = useState(0);

	return (
		<div
			className={`flex h-full overflow-hidden rounded-lg border ${isDark ? "border-neutral-800 bg-neutral-950" : "border-neutral-200 bg-neutral-50"}`}
		>
			<div
				className={`w-48 shrink-0 border-r ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
			>
				<div className="p-3">
					<p
						className={`text-xs font-medium ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						Conversations
					</p>
				</div>
				<div className="flex flex-col">
					{conversations.map(
						(conversation, index): React.ReactElement => (
							<button
								key={conversation.name}
								type="button"
								className={`flex w-full flex-col px-3 py-2 text-left ${
									selectedIndex === index
										? isDark
											? "bg-neutral-800/50"
											: "bg-neutral-200/50"
										: ""
								}`}
								onClick={(): void => {
									setSelectedIndex(index);
								}}
							>
								<div className="flex items-center justify-between">
									<span
										className={`text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
									>
										{conversation.name}
									</span>
									{conversation.unreadCount > 0 && (
										<span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-medium text-white">
											{conversation.unreadCount}
										</span>
									)}
								</div>
								<p
									className={`truncate text-[10px] ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
								>
									{conversation.lastMessage}
								</p>
								<p
									className={`text-[10px] ${isDark ? "text-neutral-600" : "text-neutral-300"}`}
								>
									{conversation.timestamp}
								</p>
							</button>
						),
					)}
				</div>
			</div>

			<div className="flex min-w-0 flex-1 flex-col">
				<div
					className={`flex items-center justify-between border-b px-4 py-2 ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
				>
					<span
						className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
					>
						{conversations[selectedIndex]?.name}
					</span>
					<span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] text-green-500">
						End-to-end encrypted
					</span>
				</div>

				<div className="flex-1 space-y-3 overflow-y-auto p-4">
					{messages.map(
						(message, index): React.ReactElement => (
							<div
								key={index}
								className={`flex gap-2 ${message.isOwn ? "flex-row-reverse" : ""}`}
							>
								<div
									className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${
										message.isOwn
											? "bg-blue-500 text-white"
											: isDark
												? "bg-neutral-800 text-neutral-400"
												: "bg-neutral-200 text-neutral-600"
									}`}
								>
									{message.initials}
								</div>
								<div
									className={`max-w-[75%] ${message.isOwn ? "text-right" : ""}`}
								>
									<p
										className={`text-xs ${isDark ? "text-white" : "text-black"}`}
									>
										{message.text}
									</p>
									<p
										className={`text-[10px] ${isDark ? "text-neutral-600" : "text-neutral-300"}`}
									>
										{message.timestamp}
									</p>
								</div>
							</div>
						),
					)}
				</div>

				<div
					className={`border-t p-3 ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
				>
					<div className="flex gap-2">
						<input
							placeholder="Type a message..."
							type="text"
							className={`flex-1 rounded-lg border px-3 py-1.5 text-xs outline-none ${
								isDark
									? "border-neutral-800 bg-neutral-900 text-white placeholder:text-neutral-600"
									: "border-neutral-200 bg-white text-black placeholder:text-neutral-400"
							}`}
						/>
						<button
							className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white"
							type="button"
						>
							Send
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
