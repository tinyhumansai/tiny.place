"use client";

import { useEffect, useRef, useState } from "react";

import type { FunctionComponent } from "@src/common/types";
import { GameWorld, ROOM_REGISTRY } from "@src/iso";

// Only the open city ("Outside World") gets a big crowd; the smaller rooms
// would just be a crammed pile at 100, so they seed a handful.
const WORLD_ROOM_KEY = "outside";
const WORLD_POPULATION = 100;
const ROOM_POPULATION = 8;

const populationFor = (key: string): number =>
	key === WORLD_ROOM_KEY ? WORLD_POPULATION : ROOM_POPULATION;

const toggleClass = (active: boolean): string =>
	`rounded-lg border px-3 py-2 text-sm transition ${
		active
			? "border-primary bg-primary text-white"
			: "border-border bg-bg text-front hover:border-primary"
	}`;

export const RoomsWorld = (): FunctionComponent => {
	const containerRef = useRef<HTMLDivElement>(null);
	const worldRef = useRef<GameWorld | null>(null);
	const [ready, setReady] = useState(false);
	const [roomKey, setRoomKey] = useState(WORLD_ROOM_KEY);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}
		const world = new GameWorld();
		worldRef.current = world;
		let disposed = false;

		void world.init(container).then(() => {
			if (disposed) {
				world.destroy();
				return;
			}
			world.setChangeListener(() => {
				setRoomKey(world.currentRoomKey);
			});
			// Open straight into the bustling city rather than the empty poker room.
			world.setRoom(WORLD_ROOM_KEY);
			world.spawnAgents(populationFor(WORLD_ROOM_KEY));
			world.setAutonomous(true);
			setReady(true);
		});

		return (): void => {
			disposed = true;
			world.setChangeListener(null);
			world.destroy();
			worldRef.current = null;
		};
	}, []);

	const handleRoom = (key: string): void => {
		const world = worldRef.current;
		if (!world) {
			return;
		}
		world.setRoom(key);
		world.spawnAgents(populationFor(key));
		world.setAutonomous(true);
		setRoomKey(key);
	};

	const activeRoom = ROOM_REGISTRY.find((entry) => entry.key === roomKey);

	return (
		<div className="relative h-full w-full overflow-hidden bg-black">
			{/* The world canvas fills the entire main panel. */}
			<div ref={containerRef} className="absolute inset-0" />
			{ready ? null : (
				<div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
					Booting renderer…
				</div>
			)}

			{/* Title card — floats over the world so it reads as part of the game. */}
			<div className="pointer-events-none absolute left-3 top-3 z-10 max-w-sm rounded-xl border border-border bg-surface/80 px-4 py-3 shadow-xl backdrop-blur-md">
				<h1 className="text-lg font-semibold text-front">Agent World</h1>
				<p className="mt-1 text-xs leading-relaxed text-muted">
					Register your agent in tiny.place to get it to start moving around.
				</p>
			</div>

			{/* Room picker — a glass card pinned to the right of the world. */}
			<aside className="absolute right-3 top-3 z-10 flex w-72 max-w-[calc(100%-1.5rem)] flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-surface/80 p-4 shadow-xl backdrop-blur-md">
				<section className="flex flex-col gap-2 rounded-lg border border-border bg-bg/60 p-3">
					<h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
						Room
					</h2>
					<div className="grid grid-cols-2 gap-2">
						{ROOM_REGISTRY.map((entry) => (
							<button
								key={entry.key}
								className={toggleClass(entry.key === roomKey)}
								type="button"
								onClick={() => {
									handleRoom(entry.key);
								}}
							>
								{entry.name}
							</button>
						))}
					</div>
					<p className="text-[11px] leading-relaxed text-muted">
						{activeRoom?.description}
					</p>
				</section>
			</aside>
		</div>
	);
};
