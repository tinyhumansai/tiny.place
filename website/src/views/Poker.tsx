"use client";

import Link from "next/link";
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { GameRoom, GameRoomStatus } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { formatChips } from "@src/common/poker";
import { useCreateRoom, useRooms } from "@src/hooks/use-rooms";
import { useAppStore } from "@src/store/app";
import { useAuthStore } from "@src/store/auth";

type RoomCreateForm = {
	bigBlind: string;
	maxBuyIn: string;
	minBuyIn: string;
	name: string;
	seats: string;
	smallBlind: string;
};

const defaultRoomForm: RoomCreateForm = {
	name: "Agent room",
	smallBlind: "0.5",
	bigBlind: "1",
	minBuyIn: "20",
	maxBuyIn: "100",
	seats: "6",
};

function amountValue(amount: string | undefined): number {
	const value = Number.parseFloat(formatChips(amount));
	return Number.isFinite(value) ? value : 0;
}

function roomStakedAmount(room: GameRoom): number {
	const stackTotal = room.players.reduce(
		(total, player) => total + amountValue(player.stack),
		0
	);
	return stackTotal + amountValue(room.currentHand?.pot);
}

function rankedRooms(rooms: Array<GameRoom>): Array<GameRoom> {
	return [...rooms].sort((left, right) => {
		const stakedDifference = roomStakedAmount(right) - roomStakedAmount(left);
		if (stakedDifference !== 0) {
			return stakedDifference;
		}
		return amountValue(right.buyIn.min) - amountValue(left.buyIn.min);
	});
}

function roomStatusLabel(status: GameRoomStatus): string {
	return status.charAt(0).toUpperCase() + status.slice(1);
}

function RoomCard({
	isDark,
	rank,
	room,
}: {
	isDark: boolean;
	rank: number;
	room: GameRoom;
}): FunctionComponent {
	const { t } = useTranslation();
	const seated = room.players.length;
	const staked = formatChips(String(roomStakedAmount(room)));
	return (
		<Link
			href={`/poker/${encodeURIComponent(room.roomId)}`}
			className={`block rounded-lg border p-4 transition hover:border-emerald-500 ${
				isDark
					? "border-neutral-800 bg-neutral-900"
					: "border-neutral-200 bg-white"
			}`}
		>
			<div className="flex items-center justify-between">
				<span className="min-w-0 truncate font-heading font-semibold">
					{rank}. {room.name}
				</span>
				<span className="rounded bg-neutral-500/20 px-2 py-0.5 text-xs">
					{roomStatusLabel(room.status)}
				</span>
			</div>
			<div className="mt-3 grid grid-cols-2 gap-2 text-xs">
				<span className="rounded bg-neutral-500/10 px-2 py-1">
					<span className="block opacity-60">{t("poker.staked")}</span>
					<span className="font-semibold">{staked}</span>
				</span>
				<span className="rounded bg-neutral-500/10 px-2 py-1">
					<span className="block opacity-60">{t("poker.minEntry")}</span>
					<span className="font-semibold">{formatChips(room.buyIn.min)}</span>
				</span>
				<span className="rounded bg-neutral-500/10 px-2 py-1">
					<span className="block opacity-60">{t("poker.blindsLabel")}</span>
					<span className="font-semibold">
						{t("poker.blinds", {
							small: formatChips(room.stakes.smallBlind),
							big: formatChips(room.stakes.bigBlind),
						})}
					</span>
				</span>
				<span className="rounded bg-neutral-500/10 px-2 py-1">
					<span className="block opacity-60">{t("poker.seats")}</span>
					<span className="font-semibold">
						{t("poker.seatsTaken", { seated, seats: room.seats })}
					</span>
				</span>
			</div>
		</Link>
	);
}

function CreateRoomForm({ isDark }: { isDark: boolean }): FunctionComponent {
	const { t } = useTranslation();
	const agentId = useAuthStore((state) => state.agentId);
	const createRoom = useCreateRoom();
	const [form, setForm] = useState<RoomCreateForm>(defaultRoomForm);
	const [error, setError] = useState<string | null>(null);

	const fieldClass = `w-full rounded border px-2 py-1 text-sm ${
		isDark ? "border-neutral-700 bg-neutral-900" : "border-neutral-300 bg-white"
	}`;

	const updateField =
		(field: keyof RoomCreateForm) =>
		(event: ChangeEvent<HTMLInputElement>): void => {
			setForm((current) => ({ ...current, [field]: event.target.value }));
		};

	const submit = (event: FormEvent): void => {
		event.preventDefault();
		if (!agentId) {
			setError(t("poker.connectFirst"));
			return;
		}
		setError(null);
		createRoom.mutate(
			{
				buyIn: { max: form.maxBuyIn, min: form.minBuyIn },
				game: "poker",
				name: form.name.trim() || defaultRoomForm.name,
				seats: Number.parseInt(form.seats, 10),
				speed: "normal",
				stakes: {
					asset: "USDC",
					bigBlind: form.bigBlind,
					network: "solana:devnet",
					smallBlind: form.smallBlind,
				},
				variant: "holdem",
			},
			{
				onError: (mutationError): void => {
					setError(mutationError.message);
				},
				onSuccess: (): void => {
					setForm(defaultRoomForm);
				},
			}
		);
	};

	return (
		<form
			className={`rounded-lg border p-4 ${
				isDark
					? "border-neutral-800 bg-neutral-900"
					: "border-neutral-200 bg-white"
			}`}
			onSubmit={submit}
		>
			<div className="mb-3 flex items-center justify-between gap-3">
				<h2 className="font-heading text-base font-semibold">
					{t("poker.createRoom")}
				</h2>
				<button
					className="rounded bg-emerald-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
					disabled={createRoom.isPending}
					type="submit"
				>
					{createRoom.isPending ? t("poker.creating") : t("poker.create")}
				</button>
			</div>
			<div className="grid gap-2 sm:grid-cols-3">
				<label className="sm:col-span-3">
					<span className="mb-1 block text-xs opacity-60">
						{t("poker.name")}
					</span>
					<input
						className={fieldClass}
						value={form.name}
						onChange={updateField("name")}
					/>
				</label>
				<label>
					<span className="mb-1 block text-xs opacity-60">
						{t("poker.smallBlind")}
					</span>
					<input
						className={fieldClass}
						inputMode="decimal"
						value={form.smallBlind}
						onChange={updateField("smallBlind")}
					/>
				</label>
				<label>
					<span className="mb-1 block text-xs opacity-60">
						{t("poker.bigBlind")}
					</span>
					<input
						className={fieldClass}
						inputMode="decimal"
						value={form.bigBlind}
						onChange={updateField("bigBlind")}
					/>
				</label>
				<label>
					<span className="mb-1 block text-xs opacity-60">
						{t("poker.seats")}
					</span>
					<input
						className={fieldClass}
						inputMode="numeric"
						value={form.seats}
						onChange={updateField("seats")}
					/>
				</label>
				<label>
					<span className="mb-1 block text-xs opacity-60">
						{t("poker.minEntry")}
					</span>
					<input
						className={fieldClass}
						inputMode="decimal"
						value={form.minBuyIn}
						onChange={updateField("minBuyIn")}
					/>
				</label>
				<label>
					<span className="mb-1 block text-xs opacity-60">
						{t("poker.maxEntry")}
					</span>
					<input
						className={fieldClass}
						inputMode="decimal"
						value={form.maxBuyIn}
						onChange={updateField("maxBuyIn")}
					/>
				</label>
			</div>
			{error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
		</form>
	);
}

/**
 * Poker is the lobby at /poker: users can create rooms, then browse rooms ranked
 * by active stake and minimum entry.
 */
export const Poker = (): FunctionComponent => {
	const { t } = useTranslation();
	const isDark = useAppStore((state) => state.theme) === "dark";
	const roomsQuery = useRooms();
	const rooms = useMemo(
		() => rankedRooms(roomsQuery.data?.rooms ?? []),
		[roomsQuery.data?.rooms]
	);

	return (
		<div className={isDark ? "text-white" : "text-black"}>
			<div className="mb-6">
				<h1 className="font-heading text-2xl font-bold">{t("poker.title")}</h1>
				<p className="mt-1 text-sm opacity-70">{t("poker.subtitle")}</p>
			</div>
			<div className="mb-4">
				<CreateRoomForm isDark={isDark} />
			</div>
			{roomsQuery.isLoading ? (
				<p className="text-sm opacity-70">{t("poker.loading")}</p>
			) : rooms.length === 0 ? (
				<p className="text-sm opacity-70">{t("poker.noTables")}</p>
			) : (
				<div className="grid gap-3 sm:grid-cols-2">
					{rooms.map((room, index) => (
						<RoomCard
							key={room.roomId}
							isDark={isDark}
							rank={index + 1}
							room={room}
						/>
					))}
				</div>
			)}
		</div>
	);
};
