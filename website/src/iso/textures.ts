/**
 * Procedural texture factory.
 *
 * Every visual in the world is baked once, in greyscale, into a small shared
 * texture and then reused via `tint`. That keeps GPU memory tiny (a handful of
 * textures regardless of how many agents or chairs exist) and is what lets us
 * recolour entities for free. All textures are generated at resolution 1 with
 * `nearest` filtering so they stay crisp and chunky when the world scales up.
 */

import { Graphics, type Renderer, type Texture } from "pixi.js";

import {
	HALF_TILE_HEIGHT,
	HALF_TILE_WIDTH,
	TILE_HEIGHT,
	TILE_WIDTH,
} from "./geometry";

/** A baked texture plus the pivot that re-aligns its origin to the tile anchor. */
export interface BakedTexture {
	texture: Texture;
	anchorX: number;
	anchorY: number;
}

const SHADE_TOP = 0xffffff;
const SHADE_LEFT = 0xb6b6b6;
const SHADE_RIGHT = 0x8d8d8d;
const EDGE_COLOR = 0x05060a;

function diamondPoints(
	footprintWidth: number,
	footprintHeight: number,
	lift: number
): Array<number> {
	const north = [0, -lift];
	const east = [
		footprintWidth * HALF_TILE_WIDTH,
		footprintWidth * HALF_TILE_HEIGHT - lift,
	];
	const south = [
		(footprintWidth - footprintHeight) * HALF_TILE_WIDTH,
		(footprintWidth + footprintHeight) * HALF_TILE_HEIGHT - lift,
	];
	const west = [
		-footprintHeight * HALF_TILE_WIDTH,
		footprintHeight * HALF_TILE_HEIGHT - lift,
	];
	return [...north, ...east, ...south, ...west];
}

export class TextureFactory {
	private readonly renderer: Renderer;
	private readonly cache = new Map<string, BakedTexture>();

	public constructor(renderer: Renderer) {
		this.renderer = renderer;
	}

	/** Bake a `Graphics` whose local origin is the tile anchor point. */
	private bake(key: string, graphics: Graphics): BakedTexture {
		const existing = this.cache.get(key);
		if (existing) {
			graphics.destroy();
			return existing;
		}
		const bounds = graphics.getLocalBounds();
		const texture = this.renderer.generateTexture({
			target: graphics,
			resolution: 1,
			antialias: true,
		});
		texture.source.scaleMode = "nearest";
		const baked: BakedTexture = {
			texture,
			anchorX: -bounds.minX,
			anchorY: -bounds.minY,
		};
		graphics.destroy();
		this.cache.set(key, baked);
		return baked;
	}

	/** A flat floor diamond with a soft bevel and a faint grid edge. */
	public floorTile(): BakedTexture {
		const graphics = new Graphics();
		graphics
			.poly(diamondPoints(1, 1, 0))
			.fill({ color: 0xe2e2e2 })
			.stroke({ color: EDGE_COLOR, width: 1, alpha: 0.18, alignment: 0.5 });
		// Inset highlight diamond for a subtle bevelled surface.
		const inset = 0.12;
		graphics
			.poly([
				0 + 0,
				inset * TILE_HEIGHT,
				TILE_WIDTH / 2 - inset * TILE_WIDTH,
				TILE_HEIGHT / 2,
				0,
				TILE_HEIGHT - inset * TILE_HEIGHT,
				-(TILE_WIDTH / 2 - inset * TILE_WIDTH),
				TILE_HEIGHT / 2,
			])
			.fill({ color: SHADE_TOP, alpha: 0.85 });
		return this.bake("floor", graphics);
	}

	/** A flat decorative diamond (rugs, mats) spanning a footprint. */
	public decal(footprintWidth: number, footprintHeight: number): BakedTexture {
		const key = `decal:${footprintWidth}x${footprintHeight}`;
		const graphics = new Graphics();
		graphics
			.poly(diamondPoints(footprintWidth, footprintHeight, 0))
			.fill({ color: SHADE_TOP })
			.stroke({ color: EDGE_COLOR, width: 2, alpha: 0.25 });
		return this.bake(key, graphics);
	}

	/**
	 * A three-tone isometric cuboid spanning `footprintWidth x footprintHeight`
	 * tiles and rising `height` pixels. The workhorse behind walls, tables,
	 * benches, desks and the courthouse dais.
	 */
	public cuboid(
		footprintWidth: number,
		footprintHeight: number,
		height: number,
		key = `cuboid:${footprintWidth}x${footprintHeight}x${height}`
	): BakedTexture {
		const graphics = new Graphics();
		const top = diamondPoints(footprintWidth, footprintHeight, height);
		// Top corners: [north, east, south, west].
		const eastX = top[2]!;
		const eastY = top[3]!;
		const southX = top[4]!;
		const southY = top[5]!;
		const westX = top[6]!;
		const westY = top[7]!;
		// Right face (east -> south) dropped to ground.
		graphics
			.poly([
				eastX,
				eastY,
				southX,
				southY,
				southX,
				southY + height,
				eastX,
				eastY + height,
			])
			.fill({ color: SHADE_RIGHT })
			.stroke({ color: EDGE_COLOR, width: 1, alpha: 0.3 });
		// Left face (south -> west) dropped to ground.
		graphics
			.poly([
				southX,
				southY,
				westX,
				westY,
				westX,
				westY + height,
				southX,
				southY + height,
			])
			.fill({ color: SHADE_LEFT })
			.stroke({ color: EDGE_COLOR, width: 1, alpha: 0.3 });
		// Top face last so the seams sit cleanly on top.
		graphics
			.poly(top)
			.fill({ color: SHADE_TOP })
			.stroke({ color: EDGE_COLOR, width: 1, alpha: 0.35 });
		return this.bake(key, graphics);
	}

	/** A small chair: a seat block with a low back, facing the camera. */
	public chair(): BakedTexture {
		const graphics = new Graphics();
		const seat = diamondPoints(0.62, 0.62, 12);
		const eastX = seat[2]!;
		const eastY = seat[3]!;
		const southX = seat[4]!;
		const southY = seat[5]!;
		const westX = seat[6]!;
		const westY = seat[7]!;
		const northX = seat[0]!;
		const northY = seat[1]!;
		// Seat sides.
		graphics
			.poly([
				eastX,
				eastY,
				southX,
				southY,
				southX,
				southY + 12,
				eastX,
				eastY + 12,
			])
			.fill({ color: SHADE_RIGHT });
		graphics
			.poly([
				southX,
				southY,
				westX,
				westY,
				westX,
				westY + 12,
				southX,
				southY + 12,
			])
			.fill({ color: SHADE_LEFT });
		graphics
			.poly(seat)
			.fill({ color: SHADE_TOP })
			.stroke({ color: EDGE_COLOR, width: 1, alpha: 0.3 });
		// Back rest rising from the north edge.
		graphics
			.poly([
				northX,
				northY,
				eastX,
				eastY,
				eastX,
				eastY - 18,
				northX,
				northY - 18,
			])
			.fill({ color: SHADE_LEFT });
		graphics
			.poly([
				westX,
				westY,
				northX,
				northY,
				northX,
				northY - 18,
				westX,
				westY - 18,
			])
			.fill({ color: SHADE_RIGHT });
		return this.bake("chair", graphics);
	}

	/**
	 * A soft rounded character body — feet at local (0, 0), head above. Drawn in
	 * greyscale so the per-agent `tint` colours the whole figure cohesively. The
	 * face is a separate untinted overlay (see {@link TextureFactory.agentFace}).
	 */
	public agentBody(): BakedTexture {
		const graphics = new Graphics();
		// Stubby arms tucked behind the torso.
		graphics.ellipse(-12, -15, 3.6, 7).fill({ color: 0xe2e2e2 });
		graphics.ellipse(12, -15, 3.6, 7).fill({ color: 0xe2e2e2 });
		// Two little feet.
		graphics.ellipse(-6, -2, 5, 3.4).fill({ color: 0xbcbcbc });
		graphics.ellipse(6, -2, 5, 3.4).fill({ color: 0xbcbcbc });
		// Torso capsule with a clean outline.
		graphics
			.roundRect(-13, -39, 26, 39, 12)
			.fill({ color: SHADE_TOP })
			.stroke({ color: 0x1a1d29, width: 1.5, alpha: 0.22, alignment: 0 });
		// Rounded belly shade and a soft chest highlight for volume.
		graphics.ellipse(0, -8, 11, 8).fill({ color: 0xd2d2d2, alpha: 0.55 });
		graphics.ellipse(-4, -29, 6, 7).fill({ color: 0xffffff, alpha: 0.5 });
		// A little antenna with a bobble to give each agent some personality.
		graphics.rect(-0.8, -46, 1.6, 8).fill({ color: 0xc8c8c8 });
		graphics
			.circle(0, -47, 2.6)
			.fill({ color: 0xf2f2f2 })
			.stroke({ color: 0x1a1d29, width: 1, alpha: 0.2 });
		return this.bake("agent", graphics);
	}

	/**
	 * Facial features, baked once and left untinted so eyes, smile and blush
	 * stay legible on top of any body colour. Pupils and mouth sit slightly to
	 * one side so a horizontal flip reads as the agent changing which way it
	 * faces.
	 */
	public agentFace(): BakedTexture {
		const graphics = new Graphics();
		// Rosy cheeks.
		graphics.ellipse(-9, 3, 3.2, 2.1).fill({ color: 0xff9aa2, alpha: 0.5 });
		graphics.ellipse(9, 3, 3.2, 2.1).fill({ color: 0xff9aa2, alpha: 0.5 });
		// Eye whites.
		graphics.ellipse(-5, 0, 4.2, 5.2).fill({ color: 0xffffff });
		graphics.ellipse(5, 0, 4.2, 5.2).fill({ color: 0xffffff });
		// Pupils, nudged toward the facing direction.
		graphics.ellipse(-4.2, 1, 2.3, 3).fill({ color: 0x1a1d29 });
		graphics.ellipse(5.8, 1, 2.3, 3).fill({ color: 0x1a1d29 });
		// Catchlights.
		graphics.circle(-5.2, -0.6, 1).fill({ color: 0xffffff });
		graphics.circle(4.8, -0.6, 1).fill({ color: 0xffffff });
		// A gentle smile.
		graphics.ellipse(0.8, 7, 3.4, 1.7).fill({ color: 0x1a1d29, alpha: 0.85 });
		return this.bake("face", graphics);
	}

	/** A soft elliptical ground shadow, decoupled so it can fade independently. */
	public agentShadow(): BakedTexture {
		const graphics = new Graphics();
		graphics.ellipse(0, 0, 14, 7).fill({ color: 0x000000, alpha: 0.28 });
		return this.bake("shadow", graphics);
	}

	/** Rounded nine-slice background for chat bubbles. */
	public bubbleBackground(): BakedTexture {
		const graphics = new Graphics();
		graphics
			.roundRect(0, 0, 48, 48, 14)
			.fill({ color: 0xffffff })
			.stroke({ color: 0x10131c, width: 2, alpha: 0.12, alignment: 0 });
		return this.bake("bubble", graphics);
	}

	/** Little downward tail that points the bubble at the agent's head. */
	public bubbleTail(): BakedTexture {
		const graphics = new Graphics();
		graphics
			.poly([0, 0, 14, 0, 7, 9])
			.fill({ color: 0xffffff })
			.stroke({ color: 0x10131c, width: 1, alpha: 0.1 });
		return this.bake("bubble-tail", graphics);
	}

	public destroy(): void {
		for (const baked of this.cache.values()) {
			baked.texture.destroy(true);
		}
		this.cache.clear();
	}
}
