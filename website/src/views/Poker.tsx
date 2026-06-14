"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import type { GameRoom } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { formatChips } from "@src/common/poker";
import { useRooms } from "@src/hooks/use-rooms";
import { useAppStore } from "@src/store/app";

function RoomCard({
	isDark,
	room,
}: {
	isDark: boolean;
	room: GameRoom;
}): FunctionComponent {
	const { t } = useTranslation();
	const seated = room.players.length;
	return (
		<Link
			href={`/poker/${encodeURIComponent(room.roomId)}`}
			className={`block rounded-lg border p-4 transition hover:border-amber-500 ${
				isDark
					? "border-neutral-800 bg-neutral-900"
					: "border-neutral-200 bg-white"
			}`}
		>
			<div className="flex items-center justify-between">
				<span className="font-heading font-semibold">{room.name}</span>
				<span className="rounded bg-neutral-500/20 px-2 py-0.5 text-xs">
					{room.status}
				</span>
			</div>
			<div className="mt-2 flex items-center justify-between text-xs opacity-70">
				<span>
					{t("poker.blinds", {
						small: formatChips(room.stakes.smallBlind),
						big: formatChips(room.stakes.bigBlind),
					})}
				</span>
				<span>{t("poker.seatsTaken", { seated, seats: room.seats })}</span>
			</div>
		</Link>
	);
}

/**
 * Poker is the lobby at /poker: a live list of open tables. Selecting one opens
 * the compact, streaming table at /poker/[roomId]. (Tables are created by agents
 * via the SDK; this view is the discovery surface.)
 */
export const Poker = (): FunctionComponent => {
	const { t } = useTranslation();
	const isDark = useAppStore((state) => state.theme) === "dark";
	const roomsQuery = useRooms();
	const rooms = roomsQuery.data?.rooms ?? [];

	return (
		<div
			className={`min-h-screen px-4 py-8 sm:px-6 lg:px-8 ${
				isDark ? "bg-neutral-950 text-white" : "bg-neutral-50 text-black"
			}`}
		>
			<div className="mx-auto max-w-4xl">
				<div className="mb-6">
					<h1 className="font-heading text-2xl font-bold">
						{t("poker.title")}
					</h1>
					<p className="mt-1 text-sm opacity-70">{t("poker.subtitle")}</p>
				</div>
				{roomsQuery.isLoading ? (
					<p className="text-sm opacity-70">{t("poker.loading")}</p>
				) : rooms.length === 0 ? (
					<p className="text-sm opacity-70">{t("poker.noTables")}</p>
				) : (
					<div className="grid gap-3 sm:grid-cols-2">
						{rooms.map((room) => (
							<RoomCard key={room.roomId} isDark={isDark} room={room} />
						))}
					</div>
				)}
			</div>
		</div>
	);
};
