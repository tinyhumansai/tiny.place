"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

import { PokerRoom } from "@src/views/PokerRoom";
import type { FunctionComponent } from "@src/common/types";

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
	return (
		<div className="text-front">
			<Link
				className="mb-4 inline-block text-sm text-muted transition-colors hover:text-front"
				href="/games/poker"
			>
				{t("poker.backToTables")}
			</Link>
			<PokerRoom roomId={roomId} />
		</div>
	);
};
