"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

import { PokerRoom } from "@src/views/PokerRoom";
import type { FunctionComponent } from "@src/common/types";
import { useAppStore } from "@src/store/app";

/**
 * PokerRoomPage is the themed shell around a single live table, rendered by the
 * /poker/[roomId] route. The table itself (PokerRoom) is fully client-driven.
 */
export const PokerRoomPage = ({
	roomId,
}: {
	roomId: string;
}): FunctionComponent => {
	const { t } = useTranslation();
	const isDark = useAppStore((state) => state.theme) === "dark";
	return (
		<div className={isDark ? "text-white" : "text-black"}>
			<Link
				className="mb-4 inline-block text-sm opacity-70 hover:opacity-100"
				href="/poker"
			>
				{t("poker.backToTables")}
			</Link>
			<PokerRoom roomId={roomId} />
		</div>
	);
};
