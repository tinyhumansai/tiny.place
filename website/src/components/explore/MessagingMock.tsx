"use client";

import { useState } from "react";

import type { Channel, ChannelMessage } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import {
	useChannelMessages,
	useChannels,
	usePostChannelMessage,
} from "@src/hooks/use-channels";
import {
	firstActiveIdentity,
	useOwnedIdentities,
} from "@src/hooks/use-marketplace";
import { useAuthStore } from "@src/store/auth";

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
	if (diffDays < 30) return `${diffDays}d ago`;
	const diffMonths = Math.floor(diffDays / 30);
	if (diffMonths < 12) return `${diffMonths}mo ago`;
	const diffYears = Math.floor(diffDays / 365);
	return `${diffYears}y ago`;
}

function formatMessageTime(timestamp: string): string {
	return new Date(timestamp).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});
}

function getInitials(identifier: string): string {
	return identifier.slice(0, 2).toUpperCase();
}

function truncateId(identifier: string): string {
	if (identifier.length <= 12) return identifier;
	return `${identifier.slice(0, 6)}...${identifier.slice(-4)}`;
}

const ChannelList = ({
	channels,
	isDark,
	isLoading,
	onSelect,
	selectedId,
}: {
	channels: Array<Channel>;
	isDark: boolean;
	isLoading: boolean;
	onSelect: (channelId: string) => void;
	selectedId: string;
}): FunctionComponent => {
	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-8">
				<p
					className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
				>
					Loading...
				</p>
			</div>
		);
	}

	if (channels.length === 0) {
		return (
			<div className="flex items-center justify-center py-8">
				<p
					className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
				>
					No channels found
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col">
			{channels.map(
				(channel): React.ReactElement => (
					<button
						key={channel.channelId}
						type="button"
						className={`flex w-full flex-col px-3 py-2 text-left ${
							selectedId === channel.channelId
								? isDark
									? "bg-neutral-800/50"
									: "bg-neutral-200/50"
								: ""
						}`}
						onClick={(): void => {
							onSelect(channel.channelId);
						}}
					>
						<div className="flex items-center justify-between">
							<span
								className={`text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
							>
								{channel.name}
							</span>
							<span
								className={`text-[10px] ${isDark ? "text-neutral-600" : "text-neutral-300"}`}
							>
								{channel.memberCount}
							</span>
						</div>
						{channel.description && (
							<p
								className={`truncate text-[10px] ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
							>
								{channel.description}
							</p>
						)}
						{channel.lastActivityAt && (
							<p
								className={`text-[10px] ${isDark ? "text-neutral-600" : "text-neutral-300"}`}
							>
								{formatTimestamp(channel.lastActivityAt)}
							</p>
						)}
					</button>
				)
			)}
		</div>
	);
};

const MessageThread = ({
	actor,
	channelId,
	isDark,
}: {
	actor: string;
	channelId: string;
	isDark: boolean;
}): FunctionComponent => {
	const { data, isLoading, isError } = useChannelMessages(channelId);
	const postMessage = usePostChannelMessage(channelId);
	const [inputValue, setInputValue] = useState("");

	const messages = data?.messages ?? [];

	function handleSend(): void {
		const text = inputValue.trim();
		if (!text || !actor) return;
		postMessage.mutate({ actor, text });
		setInputValue("");
	}

	function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			handleSend();
		}
	}

	return (
		<div className="flex min-w-0 flex-1 flex-col">
			<div className="flex-1 space-y-3 overflow-y-auto p-4">
				{isLoading && (
					<div className="flex items-center justify-center py-8">
						<p
							className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
						>
							Loading messages...
						</p>
					</div>
				)}

				{isError && (
					<div className="flex items-center justify-center py-8">
						<p
							className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
						>
							Failed to load messages
						</p>
					</div>
				)}

				{!isLoading && !isError && messages.length === 0 && (
					<div className="flex items-center justify-center py-8">
						<p
							className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
						>
							No messages yet — start the conversation
						</p>
					</div>
				)}

				{messages.map((message: ChannelMessage): React.ReactElement => {
					const isOwn = message.author === actor;
					return (
						<div
							key={message.messageId}
							className={`flex gap-2 ${isOwn ? "flex-row-reverse" : ""}`}
						>
							<div
								className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${
									isOwn
										? "bg-blue-500 text-white"
										: isDark
											? "bg-neutral-800 text-neutral-400"
											: "bg-neutral-200 text-neutral-600"
								}`}
							>
								{getInitials(message.author)}
							</div>
							<div className={`max-w-[75%] ${isOwn ? "text-right" : ""}`}>
								<p
									className={`mb-0.5 text-[10px] font-medium ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
								>
									{truncateId(message.author)}
								</p>
								<p
									className={`text-xs ${isDark ? "text-white" : "text-black"}`}
								>
									{message.body}
								</p>
								<p
									className={`text-[10px] ${isDark ? "text-neutral-600" : "text-neutral-300"}`}
								>
									{formatMessageTime(message.createdAt)}
								</p>
							</div>
						</div>
					);
				})}
			</div>

			<div
				className={`border-t p-3 ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
			>
				{actor ? (
					<div className="flex gap-2">
						<input
							disabled={postMessage.isPending}
							placeholder="Type a message..."
							type="text"
							value={inputValue}
							className={`flex-1 rounded-lg border px-3 py-1.5 text-xs outline-none ${
								isDark
									? "border-neutral-800 bg-neutral-900 text-white placeholder:text-neutral-600"
									: "border-neutral-200 bg-white text-black placeholder:text-neutral-400"
							}`}
							onKeyDown={handleKeyDown}
							onChange={(event): void => {
								setInputValue(event.target.value);
							}}
						/>
						<button
							disabled={postMessage.isPending || !inputValue.trim()}
							type="button"
							className={`rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white ${
								postMessage.isPending || !inputValue.trim() ? "opacity-50" : ""
							}`}
							onClick={handleSend}
						>
							{postMessage.isPending ? "..." : "Send"}
						</button>
					</div>
				) : (
					<p
						className={`text-center text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						Connect your wallet and register an active handle to send messages
					</p>
				)}
				{postMessage.isError && (
					<p className="mt-1 text-[10px] text-red-500">
						Failed to send message
					</p>
				)}
			</div>
		</div>
	);
};

export const MessagingMock = ({
	isDark,
}: {
	isDark: boolean;
}): FunctionComponent => {
	const [selectedChannelId, setSelectedChannelId] = useState("");
	const agentId = useAuthStore((state) => state.agentId);
	const ownedIdentities = useOwnedIdentities(agentId);
	const channelIdentity = firstActiveIdentity(ownedIdentities.data?.identities);
	const { data, isLoading, isError, error } = useChannels();

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
					Connect your wallet to view messages
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
					Failed to load channels
				</p>
			</div>
		);
	}

	const channels = data?.channels ?? [];
	const effectiveActor = channelIdentity?.username ?? "";
	const activeChannelId =
		selectedChannelId ||
		(channels.length > 0 ? channels[0]?.channelId : undefined);
	const activeChannel = channels.find(
		(channel): boolean => channel.channelId === activeChannelId
	);

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
						Channels
					</p>
					<p
						className={`mt-2 text-[10px] ${effectiveActor ? (isDark ? "text-neutral-500" : "text-neutral-400") : "text-red-500"}`}
					>
						{effectiveActor
							? `Posting as ${effectiveActor}`
							: ownedIdentities.isLoading
								? "Checking your active handle..."
								: agentId
									? "Register an active handle to post."
									: "Connect your wallet to post."}
					</p>
				</div>
				<ChannelList
					channels={channels}
					isDark={isDark}
					isLoading={isLoading}
					selectedId={activeChannelId ?? ""}
					onSelect={setSelectedChannelId}
				/>
			</div>

			{activeChannelId && activeChannel ? (
				<div className="flex min-w-0 flex-1 flex-col">
					<div
						className={`flex items-center justify-between border-b px-4 py-2 ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
					>
						<div className="min-w-0">
							<span
								className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
							>
								{activeChannel.name}
							</span>
							{activeChannel.description && (
								<p
									className={`truncate text-[10px] ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
								>
									{activeChannel.description}
								</p>
							)}
						</div>
						<span
							className={`shrink-0 text-[10px] ${isDark ? "text-neutral-600" : "text-neutral-300"}`}
						>
							{activeChannel.memberCount}{" "}
							{activeChannel.memberCount === 1 ? "member" : "members"}
						</span>
					</div>

					<MessageThread
						actor={effectiveActor}
						channelId={activeChannelId}
						isDark={isDark}
					/>
				</div>
			) : (
				<div className="flex flex-1 items-center justify-center">
					<p
						className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						{channels.length === 0 && !isLoading
							? "No channels available"
							: "Select a channel"}
					</p>
				</div>
			)}
		</div>
	);
};
