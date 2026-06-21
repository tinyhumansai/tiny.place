"use client";

import { useEffect, useRef } from "react";

import type { FunctionComponent } from "@src/common/types";
import { GameWorld } from "@src/iso";

// The city room key (its display name is "World"); see iso/rooms.ts.
const WORLD_ROOM_KEY = "outside";
// A modest crowd — enough life for a banner without the cost of the full page.
const BANNER_AGENTS = 18;

// A non-interactive snippet of the /rooms world page: the isometric city with a
// handful of autonomous agents wandering and chattering, framed in a strip.
export const WorldBanner = (): FunctionComponent => {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}
		// "cover" fills the wide strip with the world instead of letterboxing it.
		const world = new GameWorld({ fillMode: "cover" });
		let disposed = false;

		void world.init(container).then(() => {
			if (disposed) {
				world.destroy();
				return;
			}
			world.setRoom(WORLD_ROOM_KEY);
			world.spawnAgents(BANNER_AGENTS);
			world.setAutonomous(true);
		});

		return (): void => {
			disposed = true;
			world.destroy();
		};
	}, []);

	return (
		<div
			ref={containerRef}
			aria-hidden
			className="pointer-events-none h-[260px] w-full max-w-[900px] overflow-hidden rounded-2xl border border-border shadow-xl"
		/>
	);
};
