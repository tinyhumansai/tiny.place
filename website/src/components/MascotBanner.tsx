"use client";

import { useEffect, useRef } from "react";

import type { FunctionComponent } from "@src/common/types";
import GameEngine from "@src/engine/GameEngine";
import { createBannerRoom } from "@src/engine/RoomModel";
import { DEFAULT_THEME, type RoomTheme } from "@src/engine/RoomTheme";
import { randomAppearance } from "@src/engine/SvgAvatarRenderer";
import type { Direction } from "@src/engine/types";

// Number of mascots to scatter across the band. Kept in the 10-15 range so the
// strip feels populated without the autonomy paths fighting over tiles.
const MASCOT_COUNT = 15;

// Floor band geometry (see createBannerRoom). SPAN is the half-width in screen
// tiles (±11 → ~700px wide); THICKNESS is the screen-depth in rows, kept small
// so the band stays short enough to fit the 200px banner.
const BAND_SPAN = 14;
const BAND_THICKNESS = 6;

// The door sits at the band's middle row, so only a small nudge is needed to
// account for the mascots extending ~70px above their tile (up) vs ~40px below.
const CAMERA_OFFSET_Y = -15;

// Transparent variant of the default theme: the canvas background and the walls
// are fully transparent so only the floor + mascots show, blending into the page.
const BANNER_THEME: RoomTheme = {
	...DEFAULT_THEME,
	id: "banner",
	backgroundColor: "rgba(0,0,0,0)",
	wall: {
		top: "rgba(0,0,0,0)",
		leftFace: "rgba(0,0,0,0)",
		rightFace: "rgba(0,0,0,0)",
		rightFaceAlt: "rgba(0,0,0,0)",
	},
};

function randomFigure(): string {
	const appearance = randomAppearance();
	return `skin-${appearance.skinColor}-hair-${appearance.hairColor}-shirt-${appearance.shirtColor}-pants-${appearance.pantsColor}-hs-${appearance.hairStyle}`;
}

// An embedded, non-interactive showcase: a short horizontal slice of an
// isometric room with a handful of autonomous agent mascots milling about.
export const MascotBanner = (): FunctionComponent => {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const engine = new GameEngine({
			transparent: true,
			draggable: false,
			cameraOffsetY: CAMERA_OFFSET_Y,
		});
		const room = createBannerRoom(BAND_SPAN, BAND_THICKNESS);
		let cancelled = false;

		engine.mount(container);
		void engine.loadRoom(room, BANNER_THEME).then(() => {
			if (cancelled) return;
			const tiles = room.getValidTiles();
			if (tiles.length === 0) return;
			// Spawn the mascots concurrently; order is irrelevant since each one
			// wanders autonomously once added.
			for (let index = 0; index < MASCOT_COUNT; index++) {
				const tile = tiles[Math.floor(Math.random() * tiles.length)];
				if (!tile) continue;
				const id = index + 1;
				const direction = Math.floor(Math.random() * 8) as Direction;
				void engine
					.addAvatar(
						id,
						`agent-${id}`,
						randomFigure(),
						tile.x,
						tile.y,
						0,
						direction
					)
					.then(() => {
						if (!cancelled) engine.enableAutonomy(id);
					});
			}
		});

		const observer = new ResizeObserver(() => {
			engine.resize(container.clientWidth, container.clientHeight);
			engine.centerCamera();
		});
		observer.observe(container);

		return (): void => {
			cancelled = true;
			observer.disconnect();
			engine.destroy();
		};
	}, []);

	return (
		<div
			ref={containerRef}
			aria-hidden
			className="h-[200px] w-full max-w-[900px] overflow-hidden"
		/>
	);
};
