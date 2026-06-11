"use client";

import type { FunctionComponent } from "@src/common/types";

type Suit = "hearts" | "diamonds" | "clubs" | "spades";
type Rank =
	| "2"
	| "3"
	| "4"
	| "5"
	| "6"
	| "7"
	| "8"
	| "9"
	| "10"
	| "J"
	| "Q"
	| "K"
	| "A";

const suitSymbols: Record<Suit, string> = {
	hearts: "♥",
	diamonds: "♦",
	clubs: "♣",
	spades: "♠",
};

const suitColors: Record<Suit, string> = {
	hearts: "text-red-500",
	diamonds: "text-red-500",
	clubs: "text-neutral-900",
	spades: "text-neutral-900",
};

const suitColorsDark: Record<Suit, string> = {
	hearts: "text-red-400",
	diamonds: "text-red-400",
	clubs: "text-neutral-100",
	spades: "text-neutral-100",
};

type CardProperties = {
	faceUp?: boolean;
	isDark: boolean;
	rank?: Rank;
	suit?: Suit;
};

export type { Rank, Suit };

export const Card = ({
	faceUp = true,
	isDark,
	rank,
	suit,
}: CardProperties): FunctionComponent => {
	if (!faceUp || !rank || !suit) {
		return (
			<div
				className={`flex h-16 w-11 items-center justify-center rounded-md border-2 sm:h-20 sm:w-14 ${
					isDark ? "border-blue-700 bg-blue-900" : "border-blue-400 bg-blue-600"
				}`}
			>
				<div
					className={`h-10 w-7 rounded-sm border sm:h-14 sm:w-9 ${
						isDark
							? "border-blue-600 bg-blue-800"
							: "border-blue-300 bg-blue-500"
					}`}
				/>
			</div>
		);
	}

	const color = isDark ? suitColorsDark[suit] : suitColors[suit];

	return (
		<div
			className={`flex h-16 w-11 flex-col items-center justify-between rounded-md border px-1 py-0.5 shadow-sm sm:h-20 sm:w-14 sm:px-1.5 sm:py-1 ${
				isDark
					? "border-neutral-600 bg-neutral-800"
					: "border-neutral-300 bg-white"
			}`}
		>
			<div className={`self-start text-xs font-bold sm:text-sm ${color}`}>
				{rank}
			</div>
			<div className={`text-lg sm:text-2xl ${color}`}>{suitSymbols[suit]}</div>
			<div
				className={`rotate-180 self-end text-xs font-bold sm:text-sm ${color}`}
			>
				{rank}
			</div>
		</div>
	);
};
