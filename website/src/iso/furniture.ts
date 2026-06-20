/**
 * Modular furniture.
 *
 * A {@link FurnitureSprite} is assembled from a data-driven *blueprint*: a list
 * of cheap parts (isometric cuboids, flat decals, or the shared chair shape)
 * stacked with pixel lifts. The same handful of baked textures, recoloured with
 * `tint`, build every table, couch, desk and plant in the world.
 *
 * Each piece declares two things the simulation cares about:
 *   - its **collision footprint** (which tiles block walking), and
 *   - its **interaction points** (tiles an agent can stand on to sit or inspect).
 */

import { Container, Sprite } from "pixi.js";

import {
	LAYER_DECAL,
	LAYER_FURNITURE,
	depthAt,
	tileToScreen,
} from "./geometry";
import type { BakedTexture, TextureFactory } from "./textures";
import type { FurnitureConfig, InteractionPoint } from "./types";

type PartShape = "cuboid" | "decal" | "chair";

interface FurniturePart {
	shape: PartShape;
	footprintWidth?: number;
	footprintHeight?: number;
	height?: number;
	offsetTileX?: number;
	offsetTileY?: number;
	lift?: number;
	tint?: number;
	alpha?: number;
}

interface FurnitureBlueprint {
	footprintWidth: number;
	footprintHeight: number;
	solid: boolean;
	baseTint: number;
	parts: Array<FurniturePart>;
	interactionPoints: Array<InteractionPoint>;
	/** Ground-hugging decals (rugs) sort from their back edge, below agents. */
	flat?: boolean;
}

const WOOD_DARK = 0x6b4a30;
const WOOD_MID = 0x8a6442;
const FELT_GREEN = 0x2f7d54;

function sit(
	tileOffsetX: number,
	tileOffsetY: number,
	facing: "left" | "right",
	seatDropY = 6
): InteractionPoint {
	return { tileOffsetX, tileOffsetY, action: "sit", facing, seatDropY };
}

export const FURNITURE_BLUEPRINTS: Record<string, FurnitureBlueprint> = {
	pokerTable: {
		footprintWidth: 3,
		footprintHeight: 2,
		solid: true,
		baseTint: WOOD_DARK,
		parts: [
			{ shape: "cuboid", footprintWidth: 3, footprintHeight: 2, height: 22 },
			{
				shape: "decal",
				footprintWidth: 2.6,
				footprintHeight: 1.6,
				offsetTileX: 0.2,
				offsetTileY: 0.2,
				lift: 22,
				tint: FELT_GREEN,
			},
		],
		interactionPoints: [],
	},
	courtTable: {
		footprintWidth: 2,
		footprintHeight: 1,
		solid: true,
		baseTint: WOOD_MID,
		parts: [
			{ shape: "cuboid", footprintWidth: 2, footprintHeight: 1, height: 18 },
			{
				shape: "decal",
				footprintWidth: 1.8,
				footprintHeight: 0.8,
				offsetTileX: 0.1,
				offsetTileY: 0.1,
				lift: 18,
				tint: 0xb98a5e,
			},
		],
		interactionPoints: [],
	},
	judgeBench: {
		footprintWidth: 2,
		footprintHeight: 1,
		solid: true,
		baseTint: 0x5a3d28,
		parts: [
			{ shape: "cuboid", footprintWidth: 2, footprintHeight: 1, height: 32 },
			{
				shape: "decal",
				footprintWidth: 1.9,
				footprintHeight: 0.9,
				offsetTileX: 0.05,
				offsetTileY: 0.05,
				lift: 32,
				tint: 0x4a3020,
			},
		],
		interactionPoints: [],
	},
	witnessStand: {
		footprintWidth: 1,
		footprintHeight: 1,
		solid: true,
		baseTint: 0x5a3d28,
		parts: [
			{ shape: "cuboid", footprintWidth: 1, footprintHeight: 1, height: 26 },
		],
		interactionPoints: [],
	},
	desk: {
		footprintWidth: 2,
		footprintHeight: 1,
		solid: true,
		baseTint: 0x9a7350,
		parts: [
			{ shape: "cuboid", footprintWidth: 2, footprintHeight: 1, height: 18 },
			{
				shape: "decal",
				footprintWidth: 1.8,
				footprintHeight: 0.8,
				offsetTileX: 0.1,
				offsetTileY: 0.1,
				lift: 18,
				tint: 0xc9a878,
			},
			// A little dark monitor on the desk's far edge.
			{
				shape: "cuboid",
				footprintWidth: 0.7,
				footprintHeight: 0.16,
				height: 14,
				offsetTileX: 0.2,
				offsetTileY: 0.18,
				lift: 18,
				tint: 0x20242e,
			},
		],
		interactionPoints: [],
	},
	whiteboard: {
		footprintWidth: 1,
		footprintHeight: 1,
		solid: true,
		baseTint: 0xeef1f6,
		parts: [
			{
				shape: "cuboid",
				footprintWidth: 1,
				footprintHeight: 0.18,
				height: 34,
				offsetTileY: 0.4,
			},
		],
		interactionPoints: [
			{ tileOffsetX: 0, tileOffsetY: 1, action: "inspect", facing: "right" },
		],
	},
	bookshelf: {
		footprintWidth: 1,
		footprintHeight: 1,
		solid: true,
		baseTint: 0x6e4a30,
		parts: [
			{
				shape: "cuboid",
				footprintWidth: 1,
				footprintHeight: 0.3,
				height: 40,
				offsetTileY: 0.35,
			},
		],
		interactionPoints: [],
	},
	couch: {
		footprintWidth: 2,
		footprintHeight: 1,
		solid: false,
		baseTint: 0x8a5a6a,
		parts: [
			{ shape: "cuboid", footprintWidth: 2, footprintHeight: 1, height: 12 },
			// Backrest along the north edge.
			{
				shape: "cuboid",
				footprintWidth: 2,
				footprintHeight: 0.28,
				height: 20,
				lift: 12,
			},
		],
		interactionPoints: [sit(0, 0, "right", 4), sit(1, 0, "left", 4)],
	},
	coffeeTable: {
		footprintWidth: 1,
		footprintHeight: 1,
		solid: true,
		baseTint: 0x7a5a3c,
		parts: [
			{ shape: "cuboid", footprintWidth: 1, footprintHeight: 1, height: 10 },
			{
				shape: "decal",
				footprintWidth: 0.8,
				footprintHeight: 0.8,
				offsetTileX: 0.1,
				offsetTileY: 0.1,
				lift: 10,
				tint: 0x9c7a52,
			},
		],
		interactionPoints: [],
	},
	tvStand: {
		footprintWidth: 2,
		footprintHeight: 1,
		solid: true,
		baseTint: 0x3a3f4a,
		parts: [
			{
				shape: "cuboid",
				footprintWidth: 2,
				footprintHeight: 0.5,
				height: 10,
				offsetTileY: 0.25,
			},
			{
				shape: "cuboid",
				footprintWidth: 1.6,
				footprintHeight: 0.14,
				height: 22,
				offsetTileX: 0.2,
				offsetTileY: 0.4,
				lift: 10,
				tint: 0x141821,
			},
		],
		interactionPoints: [],
	},
	bed: {
		footprintWidth: 2,
		footprintHeight: 2,
		solid: true,
		baseTint: 0x9a8fb0,
		parts: [
			{ shape: "cuboid", footprintWidth: 2, footprintHeight: 2, height: 12 },
			{
				shape: "decal",
				footprintWidth: 1.8,
				footprintHeight: 1.8,
				offsetTileX: 0.1,
				offsetTileY: 0.1,
				lift: 12,
				tint: 0xd5cfe6,
			},
			// Pillow.
			{
				shape: "decal",
				footprintWidth: 1.5,
				footprintHeight: 0.5,
				offsetTileX: 0.25,
				offsetTileY: 0.15,
				lift: 12,
				tint: 0xf2eefb,
			},
		],
		interactionPoints: [],
	},
	plant: {
		footprintWidth: 1,
		footprintHeight: 1,
		solid: true,
		baseTint: 0x9a6b4a,
		parts: [
			{
				shape: "cuboid",
				footprintWidth: 0.45,
				footprintHeight: 0.45,
				height: 12,
				offsetTileX: 0.28,
				offsetTileY: 0.28,
			},
			{
				shape: "cuboid",
				footprintWidth: 0.6,
				footprintHeight: 0.6,
				height: 18,
				offsetTileX: 0.2,
				offsetTileY: 0.2,
				lift: 12,
				tint: 0x3f8f53,
			},
		],
		interactionPoints: [],
	},
	rug: {
		footprintWidth: 3,
		footprintHeight: 3,
		solid: false,
		flat: true,
		baseTint: 0x8a5a6a,
		parts: [
			{ shape: "decal", footprintWidth: 3, footprintHeight: 3, alpha: 0.9 },
		],
		interactionPoints: [],
	},
	chair: {
		footprintWidth: 1,
		footprintHeight: 1,
		solid: false,
		baseTint: 0x7a5a3c,
		parts: [{ shape: "chair", offsetTileX: 0.19, offsetTileY: 0.19 }],
		interactionPoints: [sit(0, 0, "right", 6)],
	},
	door: {
		footprintWidth: 1,
		footprintHeight: 1,
		solid: true,
		baseTint: 0x5a3d28,
		parts: [
			// Frame against the back wall...
			{ shape: "cuboid", footprintWidth: 1, footprintHeight: 0.16, height: 46 },
			// ...with a brighter panel inset.
			{
				shape: "cuboid",
				footprintWidth: 0.72,
				footprintHeight: 0.1,
				height: 36,
				offsetTileX: 0.14,
				offsetTileY: 0.03,
				tint: 0xc98a4a,
			},
		],
		interactionPoints: [],
	},
};

/** A station an agent can occupy: the world tile plus what it does there. */
export interface FurnitureStation {
	tileX: number;
	tileY: number;
	point: InteractionPoint;
}

export class FurnitureSprite extends Container {
	public readonly kind: string;
	public readonly tileX: number;
	public readonly tileY: number;
	public readonly footprintWidth: number;
	public readonly footprintHeight: number;
	public readonly level: number;
	public readonly solid: boolean;
	private readonly stationPoints: Array<InteractionPoint>;

	public constructor(config: FurnitureConfig, factory: TextureFactory) {
		super();
		const blueprint = FURNITURE_BLUEPRINTS[config.kind];
		if (!blueprint) {
			throw new Error(`Unknown furniture kind: ${config.kind}`);
		}
		this.kind = config.kind;
		this.tileX = config.tileX;
		this.tileY = config.tileY;
		this.level = config.level ?? 0;
		this.footprintWidth = config.footprintWidth ?? blueprint.footprintWidth;
		this.footprintHeight = config.footprintHeight ?? blueprint.footprintHeight;
		this.solid = config.solid ?? blueprint.solid;
		this.stationPoints =
			config.interactionPoints ?? blueprint.interactionPoints;

		const tint = config.tint ?? blueprint.baseTint;
		for (const part of blueprint.parts) {
			this.addChild(this.buildPart(part, tint, factory));
		}

		const screen = tileToScreen(this.tileX, this.tileY, this.level);
		this.position.set(screen.x, screen.y);
		this.zIndex = blueprint.flat
			? depthAt(this.tileX, this.tileY, this.level, LAYER_DECAL)
			: depthAt(
					this.tileX + (this.footprintWidth - 1) / 2,
					this.tileY + (this.footprintHeight - 1) / 2,
					this.level,
					LAYER_FURNITURE
				);
	}

	private buildPart(
		part: FurniturePart,
		baseTint: number,
		factory: TextureFactory
	): Sprite {
		const baked = ((): BakedTexture => {
			switch (part.shape) {
				case "chair":
					return factory.chair();
				case "decal":
					return factory.decal(
						part.footprintWidth ?? 1,
						part.footprintHeight ?? 1
					);
				default:
					return factory.cuboid(
						part.footprintWidth ?? 1,
						part.footprintHeight ?? 1,
						part.height ?? 16
					);
			}
		})();

		const sprite = new Sprite(baked.texture);
		sprite.pivot.set(baked.anchorX, baked.anchorY);
		const offset = tileToScreen(part.offsetTileX ?? 0, part.offsetTileY ?? 0);
		sprite.position.set(offset.x, offset.y - (part.lift ?? 0));
		sprite.tint = part.tint ?? baseTint;
		if (part.alpha !== undefined) {
			sprite.alpha = part.alpha;
		}
		return sprite;
	}

	/** Tiles this piece blocks (empty if it is walkable). */
	public solidTiles(): Array<{ x: number; y: number }> {
		if (!this.solid) {
			return [];
		}
		const tiles: Array<{ x: number; y: number }> = [];
		for (let column = 0; column < this.footprintWidth; column++) {
			for (let row = 0; row < this.footprintHeight; row++) {
				tiles.push({ x: this.tileX + column, y: this.tileY + row });
			}
		}
		return tiles;
	}

	/** World-space interaction stations for this piece. */
	public stations(): Array<FurnitureStation> {
		return this.stationPoints.map((point) => ({
			tileX: this.tileX + point.tileOffsetX,
			tileY: this.tileY + point.tileOffsetY,
			point,
		}));
	}
}
