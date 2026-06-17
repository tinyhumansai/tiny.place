"use client";

import { useEffect, useState } from "react";

import type { FunctionComponent } from "@src/common/types";
import { useDirectMessages } from "@src/hooks/use-direct-messages";
import { unreadForPeer } from "@src/store/conversations";

type DirectMessagesProperties = {
	isDark: boolean;
};

export const DirectMessages = ({
	isDark,
}: DirectMessagesProperties): FunctionComponent => {
	const {
		isReady,
		isEnabling,
		error,
		address,
		walletAddress,
		enable,
		peers,
		threads,
		addPeer,
		addPeerError,
		send,
		isSending,
		markThreadRead,
	} = useDirectMessages();

	// Show the wallet address (what peers actually type to reach you), not the
	// opaque Signal encryption key. Fall back to the raw key only if the wallet
	// address isn't available.
	const shareAddress = walletAddress ?? address;

	const [selected, setSelected] = useState<string>("");
	const [peerInput, setPeerInput] = useState<string>("");
	const [messageInput, setMessageInput] = useState<string>("");
	const [copied, setCopied] = useState<boolean>(false);

	const selectedThread = selected ? threads[selected] : undefined;

	// While a conversation is open, anything in it (including messages that arrive
	// during the poll) counts as read. Keyed on the thread length so freshly
	// polled inbound messages are marked read without reopening the thread.
	useEffect((): void => {
		if (selected) {
			markThreadRead(selected);
		}
	}, [selected, selectedThread?.length, markThreadRead]);

	const handleCopy = (): void => {
		if (!shareAddress) {
			return;
		}
		void navigator.clipboard.writeText(shareAddress).then((): void => {
			setCopied(true);
			setTimeout((): void => {
				setCopied(false);
			}, 1500);
		});
	};

	const handleSend = (): void => {
		const text = messageInput.trim();
		if (!text || !selected || isSending) {
			return;
		}
		// Clear the draft only after the send succeeds, so a failed send keeps the
		// user's text instead of silently dropping it.
		void send(selected, text)
			.then((): void => {
				setMessageInput("");
			})
			.catch((): void => {
				/* keep the draft; the hook logs the failure */
			});
	};

	const panelClass = isDark
		? "border-neutral-800 bg-neutral-950"
		: "border-neutral-200 bg-white";
	const mutedText = isDark ? "text-neutral-500" : "text-neutral-400";

	if (!isReady) {
		return (
			<div
				className={`flex flex-col items-center justify-center gap-3 rounded-lg border p-8 text-center ${panelClass}`}
			>
				<p className={`text-sm ${mutedText}`}>
					End-to-end encrypted messaging needs a one-time signature to derive
					your encryption keys.
				</p>
				<button
					disabled={isEnabling}
					type="button"
					className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
						isDark
							? "bg-white text-black hover:bg-neutral-200"
							: "bg-black text-white hover:bg-neutral-800"
					} ${isEnabling ? "opacity-50" : ""}`}
					onClick={(): void => {
						void enable();
					}}
				>
					{isEnabling ? "Deriving keys…" : "Enable encryption"}
				</button>
				{error ? <p className="text-xs text-rose-500">{error}</p> : null}
			</div>
		);
	}

	const activeThread = selected ? (threads[selected] ?? []) : [];

	return (
		<div className="space-y-3">
			{shareAddress ? (
				<div
					className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${panelClass}`}
				>
					<div className="min-w-0">
						<span className={`block text-xs ${mutedText}`}>Your address</span>
						<span
							className={`block truncate font-mono text-xs ${
								isDark ? "text-white" : "text-black"
							}`}
						>
							{`${shareAddress.slice(0, 10)}…${shareAddress.slice(-6)}`}
						</span>
					</div>
					<button
						type="button"
						className={`shrink-0 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
							isDark
								? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
								: "bg-neutral-200 text-neutral-600 hover:bg-neutral-300"
						}`}
						onClick={(): void => {
							handleCopy();
						}}
					>
						{copied ? "Copied" : "Copy"}
					</button>
				</div>
			) : null}
			<div className="grid grid-cols-[180px_1fr] gap-3">
				<div
					className={`flex flex-col gap-2 rounded-lg border p-2 ${panelClass}`}
				>
					<form
						className="flex flex-col gap-1"
						onSubmit={(event): void => {
							event.preventDefault();
							// Clear the input only when the peer was actually added, so a
							// failed resolve (e.g. an unknown handle) keeps the user's text
							// and surfaces addPeerError instead of silently no-op'ing.
							void addPeer(peerInput).then((added): void => {
								if (added) {
									setPeerInput("");
								}
							});
						}}
					>
						<input
							placeholder="@handle or key"
							value={peerInput}
							className={`rounded-md border px-2 py-1 text-xs ${
								isDark
									? "border-neutral-800 bg-neutral-900 text-white placeholder:text-neutral-600"
									: "border-neutral-200 bg-white text-black placeholder:text-neutral-400"
							}`}
							onChange={(event): void => {
								setPeerInput(event.target.value);
							}}
						/>
						{addPeerError ? (
							<p className="px-1 text-xs text-danger">{addPeerError}</p>
						) : null}
					</form>
					{peers.length === 0 ? (
						<p className={`px-1 text-xs ${mutedText}`}>No conversations yet</p>
					) : null}
					{peers.map((peer) => {
						const unread = unreadForPeer(threads, peer.address);
						return (
							<button
								key={peer.address}
								type="button"
								className={`flex items-center justify-between gap-1 rounded-md px-2 py-1 text-left text-xs transition-colors ${
									selected === peer.address
										? isDark
											? "bg-neutral-800 text-white"
											: "bg-neutral-200 text-black"
										: mutedText
								}`}
								onClick={(): void => {
									setSelected(peer.address);
								}}
							>
								<span className="truncate">{peer.label}</span>
								{unread > 0 && selected !== peer.address ? (
									<span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-medium text-white">
										{unread > 9 ? "9+" : unread}
									</span>
								) : null}
							</button>
						);
					})}
				</div>

				<div className={`flex flex-col rounded-lg border ${panelClass}`}>
					{!selected ? (
						<div
							className={`flex flex-1 items-center justify-center p-8 text-xs ${mutedText}`}
						>
							Select or add a conversation
						</div>
					) : (
						<>
							<div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
								{activeThread.length === 0 ? (
									<p className={`text-xs ${mutedText}`}>
										No messages yet — say hello
									</p>
								) : null}
								{activeThread.map((message) => (
									<div
										key={message.id}
										className={`max-w-[75%] rounded-lg px-2.5 py-1.5 text-xs ${
											message.outgoing
												? "self-end bg-blue-600 text-white"
												: isDark
													? "self-start bg-neutral-800 text-white"
													: "self-start bg-neutral-100 text-black"
										}`}
									>
										{message.text}
									</div>
								))}
							</div>
							<form
								className="flex gap-2 border-t border-neutral-800/40 p-2"
								onSubmit={(event): void => {
									event.preventDefault();
									handleSend();
								}}
							>
								<input
									placeholder="Type a message…"
									value={messageInput}
									className={`flex-1 rounded-md border px-2 py-1 text-xs ${
										isDark
											? "border-neutral-800 bg-neutral-900 text-white placeholder:text-neutral-600"
											: "border-neutral-200 bg-white text-black placeholder:text-neutral-400"
									}`}
									onChange={(event): void => {
										setMessageInput(event.target.value);
									}}
								/>
								<button
									disabled={isSending || !messageInput.trim()}
									type="submit"
									className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
										isDark ? "bg-white text-black" : "bg-black text-white"
									} ${isSending || !messageInput.trim() ? "opacity-50" : ""}`}
								>
									Send
								</button>
							</form>
						</>
					)}
				</div>
			</div>
		</div>
	);
};
