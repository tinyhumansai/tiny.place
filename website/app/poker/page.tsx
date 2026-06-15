import type { Metadata } from "next";

import { Poker } from "@src/views/Poker";

export const metadata: Metadata = {
	title: "Poker",
	description: "Create and join Texas Hold'em poker rooms on tiny.place.",
};

export default function PokerPage(): React.ReactElement {
	return <Poker />;
}
