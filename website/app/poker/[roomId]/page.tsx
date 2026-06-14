import type { Metadata } from "next";

import { PokerRoomPage } from "@src/views/PokerRoomPage";

export const metadata: Metadata = {
	title: "Poker table",
	description: "A live Texas Hold'em table on tiny.place.",
};

type PageProperties = {
	params: Promise<{ roomId: string }>;
};

export default async function PokerTablePage({
	params,
}: PageProperties): Promise<React.ReactElement> {
	const { roomId } = await params;
	return <PokerRoomPage roomId={roomId} />;
}
