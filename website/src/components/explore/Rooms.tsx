"use client";

import { useCallback, useState } from "react";
import type { GameRoom } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { ROOM_TYPE_PRESETS, type RoomPreset } from "./room-presets";
import { useRooms } from "@src/hooks/use-rooms";

const TILE_W = 8;
const TILE_H = 4;

function tileToIso(
	x: number,
	y: number,
	height: number,
	offsetX: number,
	offsetY: number
): { isoX: number; isoY: number } {
	const isoX = (x - y) * (TILE_W / 2) + offsetX;
	const isoY = (x + y) * (TILE_H / 2) - height * 3 + offsetY;
	return { isoX, isoY };
}

function RoomPreview({
	preset,
	isDark,
}: {
	preset: RoomPreset;
	isDark: boolean;
}): FunctionComponent {
	const tiles: Array<{
		x: number;
		y: number;
		height: number;
		isoX: number;
		isoY: number;
	}> = [];

	const centerX = (preset.width * TILE_W) / 2 + 20;
	const centerY = 10;

	// A solid floor with a one-tile border, derived from the preset dimensions.
	for (let x = 0; x < preset.width; x++) {
		for (let y = 0; y < preset.height; y++) {
			const isInterior =
				x > 0 && x < preset.width - 1 && y > 0 && y < preset.height - 1;
			if (isInterior) {
				const { isoX, isoY } = tileToIso(x, y, 1, centerX, centerY);
				tiles.push({ x, y, height: 1, isoX, isoY });
			}
		}
	}

	tiles.sort((a, b) => {
		const depthA = a.x + a.y;
		const depthB = b.x + b.y;
		if (depthA !== depthB) return depthA - depthB;
		return a.height - b.height;
	});

	const baseColor = preset.color;

	return (
		<svg
			className="w-full h-full"
			preserveAspectRatio="xMidYMid meet"
			viewBox="-10 -5 180 100"
		>
			{tiles.map((tile) => {
				const { isoX, isoY } = tile;
				const hw = TILE_W / 2;
				const hh = TILE_H / 2;

				const topPoints = `${isoX},${isoY - hh} ${isoX + hw},${isoY} ${isoX},${isoY + hh} ${isoX - hw},${isoY}`;

				const leftPoints = `${isoX - hw},${isoY} ${isoX},${isoY + hh} ${isoX},${isoY + hh + 2} ${isoX - hw},${isoY + 2}`;
				const rightPoints = `${isoX + hw},${isoY} ${isoX},${isoY + hh} ${isoX},${isoY + hh + 2} ${isoX + hw},${isoY + 2}`;

				const brightness =
					tile.height === 1 ? 1 : tile.height === 2 ? 0.85 : 0.7;
				const topOpacity = 0.3 + brightness * 0.3;
				const leftOpacity = 0.15 + brightness * 0.15;
				const rightOpacity = 0.2 + brightness * 0.2;

				return (
					<g key={`${tile.x}-${tile.y}`}>
						<polygon
							fill={isDark ? baseColor : baseColor}
							opacity={leftOpacity}
							points={leftPoints}
							stroke={isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}
							strokeWidth="0.3"
						/>
						<polygon
							fill={isDark ? baseColor : baseColor}
							opacity={rightOpacity}
							points={rightPoints}
							stroke={isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}
							strokeWidth="0.3"
						/>
						<polygon
							fill={isDark ? baseColor : baseColor}
							opacity={topOpacity}
							points={topPoints}
							stroke={isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}
							strokeWidth="0.3"
						/>
					</g>
				);
			})}
		</svg>
	);
}

type RoomsProperties = {
	isDark: boolean;
};

function formatRoomStakes(room: GameRoom): string {
	return `${room.stakes.smallBlind}/${room.stakes.bigBlind} ${room.stakes.asset}`;
}

function LiveRoomList({
	isDark,
	isError,
	isLoading,
	rooms,
}: {
	isDark: boolean;
	isError: boolean;
	isLoading: boolean;
	rooms: Array<GameRoom>;
}): React.ReactElement {
	if (isLoading) {
		return (
			<p
				className={`text-sm ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
			>
				Loading live rooms...
			</p>
		);
	}

	if (isError) {
		return <p className="text-sm text-red-500">Live rooms unavailable.</p>;
	}

	if (rooms.length === 0) {
		return (
			<p
				className={`text-sm ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
			>
				No live rooms are open.
			</p>
		);
	}

	return (
		<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
			{rooms.slice(0, 6).map((room) => (
				<a
					key={room.roomId}
					href="/rooms"
					className={`rounded-lg border p-3 transition-colors ${
						isDark
							? "border-neutral-800 bg-neutral-900/50 hover:border-neutral-700"
							: "border-neutral-200 bg-white hover:border-neutral-300"
					}`}
				>
					<div className="flex items-start justify-between gap-3">
						<div>
							<h3
								className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
							>
								{room.name}
							</h3>
							<p
								className={`mt-1 text-xs ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
							>
								{room.game} / {room.variant}
							</p>
						</div>
						<span
							className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
								isDark
									? "bg-neutral-800 text-neutral-400"
									: "bg-neutral-100 text-neutral-500"
							}`}
						>
							{room.status}
						</span>
					</div>
					<div className="mt-3 grid grid-cols-3 gap-2 text-xs">
						<div>
							<p className={isDark ? "text-neutral-500" : "text-neutral-500"}>
								Stakes
							</p>
							<p className={isDark ? "text-white" : "text-black"}>
								{formatRoomStakes(room)}
							</p>
						</div>
						<div>
							<p className={isDark ? "text-neutral-500" : "text-neutral-500"}>
								Seats
							</p>
							<p className={isDark ? "text-white" : "text-black"}>
								{room.players.length}/{room.seats}
							</p>
						</div>
						<div>
							<p className={isDark ? "text-neutral-500" : "text-neutral-500"}>
								Hands
							</p>
							<p className={isDark ? "text-white" : "text-black"}>
								{room.handNumber}
							</p>
						</div>
					</div>
				</a>
			))}
		</div>
	);
}

export const Rooms = ({ isDark }: RoomsProperties): FunctionComponent => {
	const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
	const rooms = useRooms({ limit: 6 });

	const handleSelect = useCallback((key: string) => {
		setSelectedRoom((previous) => (previous === key ? null : key));
	}, []);

	return (
		<div className="space-y-6">
			<div>
				<h2
					className={`text-lg font-semibold ${isDark ? "text-white" : "text-black"}`}
				>
					Rooms
				</h2>
				<p
					className={`mt-1 text-sm ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
				>
					Themed spaces for conversation, games, governance, and trade.
				</p>
			</div>

			<div
				className={`rounded-xl border p-4 ${
					isDark
						? "border-neutral-800 bg-neutral-950"
						: "border-neutral-200 bg-neutral-50"
				}`}
			>
				<h3
					className={`mb-3 text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
				>
					Live Poker Rooms
				</h3>
				<LiveRoomList
					isDark={isDark}
					isError={rooms.isError}
					isLoading={rooms.isLoading}
					rooms={rooms.data?.rooms ?? []}
				/>
			</div>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{ROOM_TYPE_PRESETS.map((preset) => {
					const isSelected = selectedRoom === preset.key;
					return (
						<button
							key={preset.key}
							type="button"
							className={`group rounded-xl border p-4 text-left transition-all ${
								isSelected
									? isDark
										? "border-neutral-600 bg-neutral-800/80 ring-1 ring-neutral-600"
										: "border-neutral-300 bg-neutral-50 ring-1 ring-neutral-300"
									: isDark
										? "border-neutral-800 bg-neutral-900/50 hover:border-neutral-700 hover:bg-neutral-800/50"
										: "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50"
							}`}
							onClick={() => {
								handleSelect(preset.key);
							}}
						>
							<div
								className={`mb-3 h-24 overflow-hidden rounded-lg ${
									isDark ? "bg-neutral-950" : "bg-neutral-100"
								}`}
							>
								<RoomPreview isDark={isDark} preset={preset} />
							</div>

							<div className="flex items-start justify-between">
								<div>
									<h3
										className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
									>
										{preset.label}
									</h3>
									<p
										className={`mt-0.5 text-xs leading-relaxed ${
											isDark ? "text-neutral-500" : "text-neutral-400"
										}`}
									>
										{preset.description}
									</p>
								</div>
							</div>

							<div className="mt-3 flex items-center gap-3">
								<span
									className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
										isDark
											? "bg-neutral-800 text-neutral-400"
											: "bg-neutral-100 text-neutral-500"
									}`}
								>
									Up to {preset.capacity}
								</span>
								<span
									className="inline-block h-2 w-2 rounded-full"
									style={{ backgroundColor: preset.color }}
								/>
							</div>
						</button>
					);
				})}
			</div>

			{selectedRoom && (
				<div
					className={`rounded-xl border p-6 ${
						isDark
							? "border-neutral-800 bg-neutral-900/50"
							: "border-neutral-200 bg-neutral-50"
					}`}
				>
					{((): React.ReactElement | null => {
						const preset = ROOM_TYPE_PRESETS.find(
							(p) => p.key === selectedRoom
						);
						if (!preset) return null;
						// Walkable floor = the interior inside the one-tile border.
						const tileCount = (preset.width - 2) * (preset.height - 2);
						return (
							<div className="flex items-start gap-6">
								<div
									className={`h-40 w-60 shrink-0 overflow-hidden rounded-lg ${
										isDark ? "bg-neutral-950" : "bg-neutral-100"
									}`}
								>
									<RoomPreview isDark={isDark} preset={preset} />
								</div>
								<div className="flex-1">
									<h3
										className={`text-base font-semibold ${isDark ? "text-white" : "text-black"}`}
									>
										{preset.label}
									</h3>
									<p
										className={`mt-1 text-sm ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
									>
										{preset.description}
									</p>
									<div className="mt-4 grid grid-cols-3 gap-4">
										<div>
											<p
												className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
											>
												Dimensions
											</p>
											<p
												className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
											>
												{preset.width} x {preset.height}
											</p>
										</div>
										<div>
											<p
												className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
											>
												Walkable tiles
											</p>
											<p
												className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
											>
												{tileCount}
											</p>
										</div>
										<div>
											<p
												className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
											>
												Capacity
											</p>
											<p
												className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
											>
												{preset.capacity}
											</p>
										</div>
									</div>
									<a
										className="mt-4 inline-flex items-center rounded-lg px-4 py-2 text-xs font-medium text-white transition-colors hover:opacity-90"
										href="/rooms"
										style={{ backgroundColor: preset.color }}
									>
										Enter Room
									</a>
								</div>
							</div>
						);
					})()}
				</div>
			)}
		</div>
	);
};
