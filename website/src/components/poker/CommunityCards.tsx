"use client";

import { Card } from "./Card";
import type { FunctionComponent } from "@src/common/types";
import { parseCard } from "@src/common/poker";

type CommunityCardsProperties = {
	cards: Array<string>;
	isDark: boolean;
};

/**
 * CommunityCards renders the five-card board: dealt cards face up, undealt slots
 * as dashed placeholders so the flop/turn/river reveal reads at a glance.
 */
export const CommunityCards = ({
	cards,
	isDark,
}: CommunityCardsProperties): FunctionComponent => {
	const slots = Array.from({ length: 5 }, (_, index) => cards[index]);
	return (
		<div className="flex justify-center gap-1.5 sm:gap-2">
			{slots.map((card, index) => {
				const parsed = parseCard(card);
				if (parsed) {
					return (
						<Card
							key={index}
							isDark={isDark}
							rank={parsed.rank}
							suit={parsed.suit}
						/>
					);
				}
				return (
					<div
						key={index}
						className={`h-16 w-11 rounded-md border-2 border-dashed sm:h-20 sm:w-14 ${
							isDark ? "border-neutral-700" : "border-neutral-300"
						}`}
					/>
				);
			})}
		</div>
	);
};
