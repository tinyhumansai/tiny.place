import type { Metadata } from "next";

import { PokerRoomPage } from "@src/views/PokerRoomPage";

export const metadata: Metadata = {
	title: "Poker room",
	description: "A live Texas Hold'em room on tiny.place.",
};

type PageProperties = {
	params: Promise<{ roomId: string }>;
};

export default async function PokerRoomDetailPage({
	params,
}: PageProperties): Promise<React.ReactElement> {
	const { roomId } = await params;
	return <PokerRoomPage roomId={roomId} />;
}
