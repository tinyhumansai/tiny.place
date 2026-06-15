"use client";

import { useEffect, useRef } from "react";

import type { FunctionComponent } from "@src/common/types";
import type { RoomChatLine } from "@src/common/poker";

type ActionChatboxProperties = {
	emptyLabel: string;
	isLive: boolean;
	lines: Array<RoomChatLine>;
	liveLabel: string;
	offlineLabel: string;
	title: string;
};

const toneClass: Record<RoomChatLine["tone"], string> = {
	action: "",
	system: "text-muted",
	win: "font-semibold text-warning",
};

/**
 * ActionChatbox renders the live narration of everything happening at the table:
 * blinds, bets, community cards, showdowns and wins, newest at the bottom and
 * auto-scrolled. It is a pure presentational component fed pre-formatted lines.
 */
export const ActionChatbox = ({
	emptyLabel,
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
		<div className="theme-surface-card flex h-full min-h-[18rem] flex-col rounded-lg border">
			<header className="flex items-center justify-between border-b border-border px-3 py-2">
				<span className="text-sm font-semibold">{title}</span>
				<span className="flex items-center gap-1.5 text-xs">
					<span
						className={`inline-block h-2 w-2 rounded-full ${
							isLive ? "bg-positive" : "bg-muted"
						}`}
					/>
					{isLive ? liveLabel : offlineLabel}
				</span>
			</header>
			<div className="flex-1 space-y-1 overflow-y-auto px-3 py-2 text-sm">
				{lines.length === 0 ? (
					<p className="text-muted">{emptyLabel}</p>
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
