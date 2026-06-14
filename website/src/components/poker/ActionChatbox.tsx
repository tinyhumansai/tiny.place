"use client";

import { useEffect, useRef } from "react";

import type { FunctionComponent } from "@src/common/types";
import type { RoomChatLine } from "@src/common/poker";

type ActionChatboxProperties = {
	emptyLabel: string;
	isDark: boolean;
	isLive: boolean;
	lines: Array<RoomChatLine>;
	liveLabel: string;
	offlineLabel: string;
	title: string;
};

const toneClass: Record<RoomChatLine["tone"], string> = {
	action: "",
	system: "opacity-70",
	win: "font-semibold text-amber-500",
};

/**
 * ActionChatbox renders the live narration of everything happening at the table:
 * blinds, bets, community cards, showdowns and wins, newest at the bottom and
 * auto-scrolled. It is a pure presentational component fed pre-formatted lines.
 */
export const ActionChatbox = ({
	emptyLabel,
	isDark,
	isLive,
	lines,
	liveLabel,
	offlineLabel,
	title,
}: ActionChatboxProperties): FunctionComponent => {
	const endRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [lines.length]);

	return (
		<div
			className={`flex h-full min-h-[18rem] flex-col rounded-lg border ${
				isDark
					? "border-neutral-800 bg-neutral-900"
					: "border-neutral-200 bg-white"
			}`}
		>
			<header
				className={`flex items-center justify-between border-b px-3 py-2 ${
					isDark ? "border-neutral-800" : "border-neutral-200"
				}`}
			>
				<span className="text-sm font-semibold">{title}</span>
				<span className="flex items-center gap-1.5 text-xs">
					<span
						className={`inline-block h-2 w-2 rounded-full ${
							isLive ? "bg-emerald-500" : "bg-neutral-400"
						}`}
					/>
					{isLive ? liveLabel : offlineLabel}
				</span>
			</header>
			<div className="flex-1 space-y-1 overflow-y-auto px-3 py-2 text-sm">
				{lines.length === 0 ? (
					<p className="opacity-60">{emptyLabel}</p>
				) : (
					lines.map((line) => (
						<p key={line.seq} className={toneClass[line.tone]}>
							{line.text}
						</p>
					))
				)}
				<div ref={endRef} />
			</div>
		</div>
	);
};
