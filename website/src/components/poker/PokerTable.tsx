"use client";

import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";

import { Card, type Rank, type Suit } from "./Card";

type MockCard = {
	rank: Rank;
	suit: Suit;
};

type MockPlayer = {
	action: string;
	cards: Array<MockCard>;
	chips: number;
	isDealer: boolean;
	name: string;
	showCards: boolean;
};

const COMMUNITY_CARDS: Array<MockCard> = [
	{ rank: "A", suit: "spades" },
	{ rank: "K", suit: "hearts" },
	{ rank: "10", suit: "diamonds" },
	{ rank: "7", suit: "clubs" },
	{ rank: "2", suit: "hearts" },
];

const ALL_PLAYERS: Array<MockPlayer> = [
	{
		name: "You",
		chips: 4850,
		cards: [
			{ rank: "A", suit: "hearts" },
			{ rank: "K", suit: "spades" },
		],
		showCards: true,
		action: "",
		isDealer: false,
	},
	{
		name: "Bot Alice",
		chips: 3200,
		cards: [
			{ rank: "Q", suit: "diamonds" },
			{ rank: "J", suit: "diamonds" },
		],
		showCards: false,
		action: "Call",
		isDealer: true,
	},
	{
		name: "Bot Bob",
		chips: 7500,
		cards: [
			{ rank: "9", suit: "clubs" },
			{ rank: "9", suit: "spades" },
		],
		showCards: false,
		action: "Raise",
		isDealer: false,
	},
	{
		name: "Bot Carol",
		chips: 2100,
		cards: [
			{ rank: "5", suit: "hearts" },
			{ rank: "6", suit: "hearts" },
		],
		showCards: false,
		action: "Fold",
		isDealer: false,
	},
	{
		name: "Bot Dave",
		chips: 5000,
		cards: [
			{ rank: "8", suit: "diamonds" },
			{ rank: "10", suit: "clubs" },
		],
		showCards: false,
		action: "Check",
		isDealer: false,
	},
	{
		name: "Bot Eve",
		chips: 1500,
		cards: [
			{ rank: "2", suit: "spades" },
			{ rank: "3", suit: "clubs" },
		],
		showCards: false,
		action: "All-in",
		isDealer: false,
	},
	{
		name: "Bot Frank",
		chips: 6200,
		cards: [
			{ rank: "K", suit: "clubs" },
			{ rank: "Q", suit: "hearts" },
		],
		showCards: false,
		action: "Call",
		isDealer: false,
	},
	{
		name: "Bot Grace",
		chips: 3800,
		cards: [
			{ rank: "J", suit: "spades" },
			{ rank: "10", suit: "spades" },
		],
		showCards: false,
		action: "Raise",
		isDealer: false,
	},
	{
		name: "Bot Hank",
		chips: 4400,
		cards: [
			{ rank: "7", suit: "hearts" },
			{ rank: "7", suit: "diamonds" },
		],
		showCards: false,
		action: "Check",
		isDealer: false,
	},
];

const PHASES = ["Pre-flop", "Flop", "Turn", "River", "Showdown"] as const;

const actionBadgeColor = (action: string, isDark: boolean): string => {
	switch (action) {
		case "Fold":
			return isDark
				? "bg-neutral-700 text-neutral-400"
				: "bg-neutral-200 text-neutral-500";
		case "All-in":
			return isDark ? "bg-red-500/20 text-red-400" : "bg-red-100 text-red-600";
		case "Raise":
			return isDark
				? "bg-amber-500/20 text-amber-400"
				: "bg-amber-100 text-amber-700";
		default:
			return isDark ? "bg-sky-500/20 text-sky-400" : "bg-sky-100 text-sky-700";
	}
};

const seatPositions: Record<number, Array<string>> = {
	2: [
		"bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2",
		"top-0 left-1/2 -translate-x-1/2 -translate-y-1/2",
	],
	3: [
		"bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2",
		"top-1/4 left-0 -translate-x-1/2",
		"top-1/4 right-0 translate-x-1/2",
	],
	4: [
		"bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2",
		"top-1/2 left-0 -translate-x-1/2 -translate-y-1/2",
		"top-0 left-1/2 -translate-x-1/2 -translate-y-1/2",
		"top-1/2 right-0 translate-x-1/2 -translate-y-1/2",
	],
	5: [
		"bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2",
		"bottom-1/4 left-0 -translate-x-1/2",
		"top-1/4 left-0 -translate-x-1/2",
		"top-0 left-1/2 -translate-x-1/2 -translate-y-1/2",
		"top-1/4 right-0 translate-x-1/2",
	],
	6: [
		"bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2",
		"bottom-1/4 left-0 -translate-x-1/2",
		"top-1/4 left-0 -translate-x-1/2",
		"top-0 left-1/2 -translate-x-1/2 -translate-y-1/2",
		"top-1/4 right-0 translate-x-1/2",
		"bottom-1/4 right-0 translate-x-1/2",
	],
	7: [
		"bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2",
		"bottom-1/4 left-0 -translate-x-1/2",
		"top-1/4 left-0 -translate-x-1/2",
		"top-0 left-1/3 -translate-x-1/2 -translate-y-1/2",
		"top-0 right-1/3 translate-x-1/2 -translate-y-1/2",
		"top-1/4 right-0 translate-x-1/2",
		"bottom-1/4 right-0 translate-x-1/2",
	],
	8: [
		"bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2",
		"bottom-1/4 left-0 -translate-x-1/2",
		"top-1/4 left-0 -translate-x-1/2",
		"top-0 left-1/4 -translate-x-1/2 -translate-y-1/2",
		"top-0 left-1/2 -translate-x-1/2 -translate-y-1/2",
		"top-0 right-1/4 translate-x-1/2 -translate-y-1/2",
		"top-1/4 right-0 translate-x-1/2",
		"bottom-1/4 right-0 translate-x-1/2",
	],
	9: [
		"bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2",
		"bottom-1/4 left-0 -translate-x-1/2",
		"top-1/2 left-0 -translate-x-1/2 -translate-y-1/2",
		"top-1/4 left-0 -translate-x-1/2",
		"top-0 left-1/3 -translate-x-1/2 -translate-y-1/2",
		"top-0 right-1/3 translate-x-1/2 -translate-y-1/2",
		"top-1/4 right-0 translate-x-1/2",
		"top-1/2 right-0 translate-x-1/2 -translate-y-1/2",
		"bottom-1/4 right-0 translate-x-1/2",
	],
};

type PokerTableProperties = {
	isDark: boolean;
};

export const PokerTable = ({
	isDark,
}: PokerTableProperties): FunctionComponent => {
	const [playerCount, setPlayerCount] = useState(6);
	const [phase, setPhase] = useState(3);
	const [betAmount, setBetAmount] = useState(100);

	const players = ALL_PLAYERS.slice(0, playerCount);
	const positions = seatPositions[playerCount] ?? seatPositions[6] ?? [];
	const visibleCommunityCards = Math.min(
		phase === 0 ? 0 : phase === 1 ? 3 : phase === 2 ? 4 : 5,
		COMMUNITY_CARDS.length
	);

	return (
		<div className="flex flex-col gap-6">
			{/* Controls bar */}
			<div
				className={`flex flex-wrap items-center gap-4 rounded-xl border px-4 py-3 ${
					isDark
						? "border-neutral-800 bg-neutral-900"
						: "border-neutral-200 bg-white"
				}`}
			>
				<div className="flex items-center gap-2">
					<span
						className={`text-xs font-medium ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
					>
						Players
					</span>
					<select
						value={playerCount}
						className={`rounded-lg border px-2 py-1 text-sm ${
							isDark
								? "border-neutral-700 bg-neutral-800 text-white"
								: "border-neutral-300 bg-neutral-50 text-black"
						}`}
						onChange={(event): void => {
							setPlayerCount(Number(event.target.value));
						}}
					>
						{Array.from({ length: 8 }, (_, index) => index + 2).map(
							(number) => (
								<option key={number} value={number}>
									{String(number)}
								</option>
							)
						)}
					</select>
				</div>

				<div className="flex items-center gap-2">
					<span
						className={`text-xs font-medium ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
					>
						Phase
					</span>
					<div className="flex gap-1">
						{PHASES.map((phaseName, index) => (
							<button
								key={phaseName}
								type="button"
								className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
									index === phase
										? isDark
											? "bg-emerald-600 text-white"
											: "bg-emerald-500 text-white"
										: isDark
											? "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
											: "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
								}`}
								onClick={(): void => {
									setPhase(index);
								}}
							>
								{phaseName}
							</button>
						))}
					</div>
				</div>
			</div>

			{/* Table area */}
			<div className="relative mx-auto h-[28rem] w-full max-w-3xl sm:h-[32rem]">
				{/* Felt */}
				<div
					className={`absolute inset-12 rounded-full border-4 shadow-inner sm:inset-16 ${
						isDark
							? "border-emerald-900 bg-emerald-800"
							: "border-emerald-600 bg-emerald-700"
					}`}
				>
					{/* Rail */}
					<div
						style={{ zIndex: -1 }}
						className={`absolute -inset-2 rounded-full border-8 ${
							isDark ? "border-neutral-800" : "border-amber-900"
						}`}
					/>

					{/* Community cards */}
					<div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
						<div className="flex gap-1 sm:gap-2">
							{COMMUNITY_CARDS.slice(0, visibleCommunityCards).map(
								(card, index) => (
									<Card
										key={`${card.rank}-${card.suit}-${String(index)}`}
										isDark={isDark}
										rank={card.rank}
										suit={card.suit}
									/>
								)
							)}
							{Array.from({
								length: 5 - visibleCommunityCards,
							}).map((_, index) => (
								<div
									key={`empty-${String(index)}`}
									className="h-16 w-11 rounded-md border border-dashed opacity-20 sm:h-20 sm:w-14"
									style={{
										borderColor: isDark ? "#6ee7b1" : "#a7f3d0",
									}}
								/>
							))}
						</div>
						{/* Pot */}
						<div
							className={`rounded-full px-3 py-1 text-xs font-semibold ${
								isDark
									? "bg-black/40 text-amber-400"
									: "bg-black/20 text-amber-100"
							}`}
						>
							Pot: $1,250
						</div>
					</div>
				</div>

				{/* Player seats */}
				{players.map((player, index) => (
					<div
						key={player.name}
						className={`absolute z-10 flex w-28 flex-col items-center gap-1 sm:w-32 ${positions[index] ?? ""}`}
					>
						{/* Cards */}
						<div className="flex gap-0.5">
							<Card
								faceUp={player.showCards}
								isDark={isDark}
								rank={player.cards[0]?.rank}
								suit={player.cards[0]?.suit}
							/>
							<Card
								faceUp={player.showCards}
								isDark={isDark}
								rank={player.cards[1]?.rank}
								suit={player.cards[1]?.suit}
							/>
						</div>

						{/* Info */}
						<div
							className={`flex w-full flex-col items-center rounded-lg border px-2 py-1.5 ${
								isDark
									? "border-neutral-700 bg-neutral-900"
									: "border-neutral-300 bg-white"
							} ${player.name === "You" ? (isDark ? "ring-2 ring-emerald-500" : "ring-2 ring-emerald-400") : ""}`}
						>
							<div className="flex w-full items-center justify-between">
								<span
									className={`truncate text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
								>
									{player.name}
								</span>
								{player.isDealer && (
									<span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[9px] font-bold text-black">
										D
									</span>
								)}
							</div>
							<span
								className={`text-[10px] ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
							>
								${player.chips.toLocaleString()}
							</span>
							{player.action && (
								<span
									className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${actionBadgeColor(player.action, isDark)}`}
								>
									{player.action}
								</span>
							)}
						</div>
					</div>
				))}
			</div>

			{/* Player action controls */}
			<div
				className={`flex flex-wrap items-center justify-center gap-3 rounded-xl border px-4 py-3 ${
					isDark
						? "border-neutral-800 bg-neutral-900"
						: "border-neutral-200 bg-white"
				}`}
			>
				<button
					type="button"
					className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
						isDark
							? "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
							: "bg-neutral-200 text-neutral-600 hover:bg-neutral-300"
					}`}
				>
					Fold
				</button>
				<button
					type="button"
					className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
						isDark
							? "bg-sky-600 text-white hover:bg-sky-500"
							: "bg-sky-500 text-white hover:bg-sky-400"
					}`}
				>
					Check
				</button>
				<button
					type="button"
					className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
						isDark
							? "bg-emerald-600 text-white hover:bg-emerald-500"
							: "bg-emerald-500 text-white hover:bg-emerald-400"
					}`}
				>
					Call $200
				</button>
				<div className="flex items-center gap-2">
					<input
						max={5000}
						min={50}
						step={50}
						type="range"
						value={betAmount}
						className={`h-1.5 w-24 cursor-pointer appearance-none rounded-full sm:w-32 ${
							isDark ? "bg-neutral-700" : "bg-neutral-300"
						}`}
						onChange={(event): void => {
							setBetAmount(Number(event.target.value));
						}}
					/>
					<button
						type="button"
						className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
							isDark
								? "bg-amber-600 text-white hover:bg-amber-500"
								: "bg-amber-500 text-white hover:bg-amber-400"
						}`}
					>
						Raise ${betAmount}
					</button>
				</div>
				<button
					type="button"
					className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
						isDark
							? "bg-red-600 text-white hover:bg-red-500"
							: "bg-red-500 text-white hover:bg-red-400"
					}`}
				>
					All-in
				</button>
			</div>
		</div>
	);
};
