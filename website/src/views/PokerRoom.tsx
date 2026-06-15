"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
	GameAction,
	GameHandPlayer,
	GameRoom,
	GameSeat,
} from "@tinyhumansai/tinyplace";

import { ActionChatbox } from "@src/components/poker/ActionChatbox";
import type { FunctionComponent } from "@src/common/types";
import {
	cardLabel,
	describeRoomEvent,
	formatChips,
	type RoomStreamEvent,
} from "@src/common/poker";
import { useJoinRoom, useRoom, useRoomAction } from "@src/hooks/use-rooms";
import { useRoomStream } from "@src/hooks/use-room-stream";
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

function boardLabel(cards: Array<string> | undefined): string {
	if (!cards || cards.length === 0) {
		return "none";
	}
	return cards.map(cardLabel).join(" ");
}

function handPlayerStatus(
	handPlayer: GameHandPlayer | undefined,
	isCurrent: boolean
): string {
	if (handPlayer?.result && handPlayer.result !== "active") {
		return handPlayer.result;
	}
	return isCurrent ? "to act" : "active";
}

function seatLabel(seat: GameSeat): string {
	return seat.handle ?? seat.cryptoId ?? `Seat ${seat.seat}`;
}

/**
 * PokerRoom is a simple live room state surface: metrics, seats, action
 * controls, and a streaming action log. Authoritative state comes from the REST
 * room query; the WebSocket stream supplies liveness, narration, and prompts.
 * Entering a round requires an x402 buy-in, handled by the join/action hooks'
 * 402-challenge retry.
 */
export const PokerRoom = ({
	roomId,
}: {
	roomId: string;
}): FunctionComponent => {
	const { t } = useTranslation();
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
		return <p className="px-4 py-8 text-sm text-muted">{t("poker.loading")}</p>;
	}
	if (!room) {
		return (
			<p className="px-4 py-8 text-sm text-muted">{t("poker.notFound")}</p>
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
						<p className="text-xs text-muted">
							{t("poker.blinds", {
								small: formatChips(room.stakes.smallBlind),
								big: formatChips(room.stakes.bigBlind),
							})}{" "}
							· {room.status}
							{hand ? ` · ${t("poker.hand", { number: hand.number })}` : ""}
						</p>
					</div>
					<div className="text-right">
						<div className="text-xs uppercase text-subtle">
							{t("poker.pot")}
						</div>
						<div className="font-heading text-lg font-bold text-warning">
							{formatChips(hand?.pot ?? "0")}
						</div>
					</div>
				</header>

				<div className="theme-surface-card grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-4">
					<div>
						<div className="text-xs uppercase text-subtle">
							{t("poker.board")}
						</div>
						<div className="font-semibold">
							{boardLabel(hand?.communityCards)}
						</div>
					</div>
					<div>
						<div className="text-xs uppercase text-subtle">
							{t("poker.minEntry")}
						</div>
						<div className="font-semibold">{formatChips(room.buyIn.min)}</div>
					</div>
					<div>
						<div className="text-xs uppercase text-subtle">
							{t("poker.maxEntry")}
						</div>
						<div className="font-semibold">{formatChips(room.buyIn.max)}</div>
					</div>
					<div>
						<div className="text-xs uppercase text-subtle">
							{t("poker.seats")}
						</div>
						<div className="font-semibold">
							{t("poker.seatsTaken", {
								seated: room.players.length,
								seats: room.seats,
							})}
						</div>
					</div>
				</div>

				<section className="theme-surface-card rounded-lg border">
					<div className="border-b border-border px-3 py-2 text-sm font-semibold">
						{t("poker.players")}
					</div>
					{players.length === 0 ? (
						<p className="px-3 py-3 text-sm text-muted">{t("poker.empty")}</p>
					) : (
						<div className="divide-y divide-border">
							{players.map((seat) => {
								const handPlayer = handPlayerBySeat.get(seat.seat);
								const position = positionBadge(
									seat.seat,
									room,
									hand?.dealerSeat,
									hand?.smallBlindSeat,
									hand?.bigBlindSeat
								);
								const isCurrent = hand?.currentSeat === seat.seat;
								return (
									<div
										key={seat.seat}
										className="grid gap-2 px-3 py-2 text-sm sm:grid-cols-[4rem_1fr_6rem_6rem]"
									>
										<div className="text-muted">
											{position ? `${seat.seat} ${position}` : seat.seat}
										</div>
										<div className="min-w-0 truncate font-medium">
											{seatLabel(seat)}
											{mySeat?.seat === seat.seat ? (
												<span className="ml-2 text-xs text-positive">
													{t("poker.you")}
												</span>
											) : null}
										</div>
										<div>{formatChips(seat.stack)}</div>
										<div className={isCurrent ? "text-warning" : "text-muted"}>
											{handPlayerStatus(handPlayer, isCurrent)}
										</div>
									</div>
								);
							})}
						</div>
					)}
				</section>

				<div className="theme-surface-card rounded-lg border p-3">
					{!mySeat ? (
						<div className="flex flex-wrap items-center gap-2">
							<input
								className="theme-input w-28 rounded border px-2 py-1 text-sm"
								inputMode="decimal"
								value={buyIn}
								placeholder={t("poker.buyInPlaceholder", {
									min: formatChips(room.buyIn.min),
								})}
								onChange={(event): void => {
									setBuyIn(event.target.value);
								}}
							/>
							<button
								disabled={joinRoom.isPending || room.status === "closed"}
								type="button"
								className={`rounded px-3 py-1 text-sm font-semibold transition-colors ${
									joinRoom.isPending || room.status === "closed"
										? "theme-disabled-action"
										: "theme-primary-action"
								}`}
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
												className="theme-input w-20 rounded border px-2 py-1 text-sm"
												inputMode="decimal"
												placeholder={formatChips(hand?.minRaise)}
												value={raiseAmount}
												onChange={(event): void => {
													setRaiseAmount(event.target.value);
												}}
											/>
											<button
												className="theme-primary-action rounded px-3 py-1 text-sm font-semibold transition-colors"
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
										className={`rounded px-3 py-1 text-sm font-semibold transition-colors ${
											roomAction.isPending
												? "theme-disabled-action"
												: action === "fold"
													? "bg-secondary text-secondary-front hover:bg-secondary-hover"
													: "theme-primary-action"
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
						<p className="text-sm text-muted">
							{t("poker.seated", { stack: formatChips(mySeat.stack) })}
						</p>
					)}
					{error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
				</div>
			</div>

			<ActionChatbox
				emptyLabel={t("poker.chatEmpty")}
				isLive={isLive}
				lines={lines}
				liveLabel={t("poker.live")}
				offlineLabel={t("poker.offline")}
				title={t("poker.chatTitle")}
			/>
		</div>
	);
};
