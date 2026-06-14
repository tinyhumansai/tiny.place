"use client";

import type { GameHandPlayer, GameSeat } from "@tinyhumansai/tinyplace";

import { Card } from "./Card";
import type { FunctionComponent } from "@src/common/types";
import { formatChips, parseCard } from "@src/common/poker";

type SeatRowProperties = {
	handPlayer: GameHandPlayer | undefined;
	isCurrent: boolean;
	isDark: boolean;
	isYou: boolean;
	position: string | undefined;
	seat: GameSeat;
};

function MiniCard({
	card,
	isDark,
}: {
	card: string | undefined;
	isDark: boolean;
}): FunctionComponent {
	const parsed = parseCard(card);
	if (!parsed) {
		return <Card faceUp={false} isDark={isDark} />;
	}
	return <Card isDark={isDark} rank={parsed.rank} suit={parsed.suit} />;
}

/**
 * SeatRow is one compact row of the table: position badge, handle, stack, status
 * and the seat's two hole cards (yours/revealed face up, everyone else's face
 * down). The on-the-clock seat is highlighted; folded seats are dimmed.
 */
export const SeatRow = ({
	handPlayer,
	isCurrent,
	isDark,
	isYou,
	position,
	seat,
}: SeatRowProperties): FunctionComponent => {
	const folded = handPlayer?.result === "folded";
	const inHand = handPlayer !== undefined;
	const highlight = isCurrent
		? isDark
			? "border-amber-500 bg-amber-500/10"
			: "border-amber-500 bg-amber-50"
		: isDark
			? "border-neutral-800 bg-neutral-900"
			: "border-neutral-200 bg-white";

	return (
		<div
			className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${highlight} ${
				folded ? "opacity-50" : ""
			}`}
		>
			<div className="flex w-8 shrink-0 justify-center">
				{position ? (
					<span className="rounded bg-neutral-500/20 px-1.5 py-0.5 text-[10px] font-bold">
						{position}
					</span>
				) : null}
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					<span className="truncate text-sm font-medium">
						{seat.handle ?? `Seat ${seat.seat}`}
					</span>
					{isYou ? (
						<span className="text-[10px] font-semibold text-emerald-500">
							you
						</span>
					) : null}
				</div>
				<div className="text-xs opacity-70">
					{formatChips(seat.stack)}
					{handPlayer?.result && handPlayer.result !== "active"
						? ` · ${handPlayer.result}`
						: isCurrent
							? " · to act"
							: ""}
				</div>
			</div>
			<div className="flex shrink-0 scale-75 gap-1 sm:scale-90">
				{inHand ? (
					(handPlayer?.holeCards ?? [undefined, undefined]).length === 2 &&
					handPlayer?.holeCards ? (
						handPlayer.holeCards.map((card, index) => (
							<MiniCard key={index} card={card} isDark={isDark} />
						))
					) : (
						<>
							<Card faceUp={false} isDark={isDark} />
							<Card faceUp={false} isDark={isDark} />
						</>
					)
				) : null}
			</div>
		</div>
	);
};
