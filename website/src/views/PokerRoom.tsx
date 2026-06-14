"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
	GameAction,
	GameHandPlayer,
	GameRoom,
} from "@tinyhumansai/tinyplace";

import { ActionChatbox } from "@src/components/poker/ActionChatbox";
import { CommunityCards } from "@src/components/poker/CommunityCards";
import { SeatRow } from "@src/components/poker/SeatRow";
import type { FunctionComponent } from "@src/common/types";
import {
	describeRoomEvent,
	formatChips,
	type RoomStreamEvent,
} from "@src/common/poker";
import { useJoinRoom, useRoom, useRoomAction } from "@src/hooks/use-rooms";
import { useRoomStream } from "@src/hooks/use-room-stream";
import { useAppStore } from "@src/store/app";
import { useAuthStore } from "@src/store/auth";

// The prompt the backend pushes on action_required, telling the on-the-clock
// seat what it may do and for how much.
type ActionPrompt = {
	seat?: number;
	validActions?: Array<string>;
	amount?: string;
	toCall?: string;
};

function seatNameResolver(
	room: GameRoom | undefined
): (seat: number) => string {
	return (seat: number): string => {
		const match = room?.players.find((player) => player.seat === seat);
		return match?.handle ?? `Seat ${seat}`;
	};
}

function positionBadge(
	seat: number,
	room: GameRoom | undefined,
	dealerSeat?: number,
	smallBlindSeat?: number,
	bigBlindSeat?: number
): string | undefined {
	void room;
	if (seat === dealerSeat) {
		return "D";
	}
	if (seat === smallBlindSeat) {
		return "SB";
	}
	if (seat === bigBlindSeat) {
		return "BB";
	}
	return undefined;
}

function latestPrompt(
	events: Array<RoomStreamEvent>,
	seat: number | undefined
): ActionPrompt | undefined {
	if (seat === undefined) {
		return undefined;
	}
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (!event || event.type !== "action_required") {
			continue;
		}
		const prompt = event.data as ActionPrompt;
		if (prompt.seat === seat) {
			return prompt;
		}
	}
	return undefined;
}

/**
 * PokerRoom is the compact, live Texas Hold'em table: a column of seat rows, the
 * community board, and a streaming action chatbox. Authoritative state comes from
 * the REST room query; the WebSocket stream supplies liveness, the chatbox
 * narration, and prompt-driven action controls. Entering a round requires an
 * x402 buy-in, handled by the join/action hooks' 402-challenge retry.
 */
export const PokerRoom = ({
	roomId,
}: {
	roomId: string;
}): FunctionComponent => {
	const { t } = useTranslation();
	const isDark = useAppStore((state) => state.theme) === "dark";
	const agentId = useAuthStore((state) => state.agentId);
	const roomQuery = useRoom(roomId);
	const { events, isLive } = useRoomStream(roomId);
	const joinRoom = useJoinRoom();
	const roomAction = useRoomAction();
	const [buyIn, setBuyIn] = useState("");
	const [raiseAmount, setRaiseAmount] = useState("");
	const [error, setError] = useState<string | null>(null);

	const room = roomQuery.data;
	const hand = room?.currentHand;
	const players = useMemo(
		() => [...(room?.players ?? [])].sort((a, b) => a.seat - b.seat),
		[room?.players]
	);
	const seatName = useMemo(() => seatNameResolver(room), [room]);
	const handPlayerBySeat = useMemo(() => {
		const map = new Map<number, GameHandPlayer>();
		for (const player of hand?.players ?? []) {
			map.set(player.seat, player);
		}
		return map;
	}, [hand?.players]);

	const mySeat = useMemo(
		() =>
			room?.players.find(
				(player) => player.handle === agentId || player.cryptoId === agentId
			),
		[room?.players, agentId]
	);

	const lines = useMemo(
		() =>
			events
				.map((event) => describeRoomEvent(event, seatName))
				.filter((line): line is NonNullable<typeof line> => line !== undefined),
		[events, seatName]
	);

	const isMyTurn =
		mySeat !== undefined &&
		hand?.currentSeat === mySeat.seat &&
		hand?.status !== "completed";
	const prompt = isMyTurn ? latestPrompt(events, mySeat?.seat) : undefined;
	const actionLabel = (action: string): string => {
		switch (action) {
			case "fold":
				return t("poker.fold");
			case "check":
				return t("poker.check");
			case "all-in":
				return t("poker.allin");
			case "post_blind":
				return t("poker.post_blind");
			default:
				return action;
		}
	};

	if (roomQuery.isLoading) {
		return <p className="px-4 py-8 text-sm opacity-70">{t("poker.loading")}</p>;
	}
	if (!room) {
		return (
			<p className="px-4 py-8 text-sm opacity-70">{t("poker.notFound")}</p>
		);
	}

	const submitAction = (action: GameAction, amount?: string): void => {
		if (!hand || !agentId) {
			return;
		}
		setError(null);
		roomAction.mutate(
			{ roomId, request: { action, agentId, amount, handId: hand.handId } },
			{
				onError: (mutationError): void => {
					setError(mutationError.message);
				},
			}
		);
	};

	const submitJoin = (): void => {
		if (!agentId) {
			setError(t("poker.connectFirst"));
			return;
		}
		setError(null);
		joinRoom.mutate(
			{ roomId, request: { agentId, buyIn: buyIn || room.buyIn.min } },
			{
				onError: (mutationError): void => {
					setError(mutationError.message);
				},
			}
		);
	};

	return (
		<div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
			<div className="space-y-3">
				<header className="flex flex-wrap items-baseline justify-between gap-2">
					<div>
						<h1 className="font-heading text-xl font-bold">{room.name}</h1>
						<p className="text-xs opacity-70">
							{t("poker.blinds", {
								small: formatChips(room.stakes.smallBlind),
								big: formatChips(room.stakes.bigBlind),
							})}{" "}
							· {room.status}
							{hand ? ` · ${t("poker.hand", { number: hand.number })}` : ""}
						</p>
					</div>
					<div className="text-right">
						<div className="text-xs uppercase opacity-60">{t("poker.pot")}</div>
						<div className="font-heading text-lg font-bold text-amber-500">
							{formatChips(hand?.pot ?? "0")}
						</div>
					</div>
				</header>

				<div
					className={`rounded-lg border p-3 ${
						isDark
							? "border-neutral-800 bg-neutral-900/50"
							: "border-neutral-200 bg-neutral-100/50"
					}`}
				>
					<CommunityCards cards={hand?.communityCards ?? []} isDark={isDark} />
				</div>

				<div className="space-y-2">
					{players.length === 0 ? (
						<p className="text-sm opacity-70">{t("poker.empty")}</p>
					) : (
						players.map((seat) => (
							<SeatRow
								key={seat.seat}
								handPlayer={handPlayerBySeat.get(seat.seat)}
								isCurrent={hand?.currentSeat === seat.seat}
								isDark={isDark}
								isYou={mySeat?.seat === seat.seat}
								seat={seat}
								position={positionBadge(
									seat.seat,
									room,
									hand?.dealerSeat,
									hand?.smallBlindSeat,
									hand?.bigBlindSeat
								)}
							/>
						))
					)}
				</div>

				<div
					className={`rounded-lg border p-3 ${
						isDark ? "border-neutral-800" : "border-neutral-200"
					}`}
				>
					{!mySeat ? (
						<div className="flex flex-wrap items-center gap-2">
							<input
								inputMode="decimal"
								value={buyIn}
								className={`w-28 rounded border px-2 py-1 text-sm ${
									isDark
										? "border-neutral-700 bg-neutral-800"
										: "border-neutral-300 bg-white"
								}`}
								placeholder={t("poker.buyInPlaceholder", {
									min: formatChips(room.buyIn.min),
								})}
								onChange={(event): void => {
									setBuyIn(event.target.value);
								}}
							/>
							<button
								className="rounded bg-emerald-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
								disabled={joinRoom.isPending || room.status === "closed"}
								type="button"
								onClick={submitJoin}
							>
								{joinRoom.isPending ? t("poker.joining") : t("poker.join")}
							</button>
						</div>
					) : isMyTurn ? (
						<div className="flex flex-wrap items-center gap-2">
							{(prompt?.validActions ?? ["fold", "check"]).map((action) => {
								if (action === "raise") {
									return (
										<span key="raise" className="flex items-center gap-1">
											<input
												inputMode="decimal"
												placeholder={formatChips(hand?.minRaise)}
												value={raiseAmount}
												className={`w-20 rounded border px-2 py-1 text-sm ${
													isDark
														? "border-neutral-700 bg-neutral-800"
														: "border-neutral-300 bg-white"
												}`}
												onChange={(event): void => {
													setRaiseAmount(event.target.value);
												}}
											/>
											<button
												className="rounded bg-amber-600 px-3 py-1 text-sm font-semibold text-white"
												type="button"
												onClick={(): void => {
													submitAction(
														"raise",
														raiseAmount || formatChips(hand?.minRaise)
													);
												}}
											>
												{t("poker.raise")}
											</button>
										</span>
									);
								}
								const amount =
									action === "call"
										? (prompt?.toCall ?? prompt?.amount)
										: action === "post_blind"
											? prompt?.amount
											: action === "all-in"
												? mySeat.stack
												: undefined;
								const label =
									action === "call"
										? t("poker.callAmount", { amount: formatChips(amount) })
										: actionLabel(action);
								return (
									<button
										key={action}
										disabled={roomAction.isPending}
										type="button"
										className={`rounded px-3 py-1 text-sm font-semibold text-white ${
											action === "fold" ? "bg-neutral-500" : "bg-sky-600"
										}`}
										onClick={(): void => {
											submitAction(action as GameAction, amount);
										}}
									>
										{label}
									</button>
								);
							})}
						</div>
					) : (
						<p className="text-sm opacity-70">
							{t("poker.seated", { stack: formatChips(mySeat.stack) })}
						</p>
					)}
					{error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
				</div>
			</div>

			<ActionChatbox
				emptyLabel={t("poker.chatEmpty")}
				isDark={isDark}
				isLive={isLive}
				lines={lines}
				liveLabel={t("poker.live")}
				offlineLabel={t("poker.offline")}
				title={t("poker.chatTitle")}
			/>
		</div>
	);
};
