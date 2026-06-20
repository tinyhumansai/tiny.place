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

type PartShape = "cuboid" | "decal" | "chair" | "buildingDetail";

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
	// Building-detail overlay parameters.
	windowRows?: number;
	windowColumns?: number;
	windowColor?: number;
	roofColor?: number;
	doorColor?: number;
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

/** A pixelated building: a tinted body cuboid plus an untinted detail overlay. */
function buildingBlueprint(options: {
	footprintWidth: number;
	footprintHeight: number;
	height: number;
	bodyTint: number;
	windowRows: number;
	windowColumns: number;
	windowColor: number;
	roofColor: number;
	doorColor: number;
}): FurnitureBlueprint {
	return {
		footprintWidth: options.footprintWidth,
		footprintHeight: options.footprintHeight,
		solid: true,
		baseTint: options.bodyTint,
		parts: [
			{
				shape: "cuboid",
				footprintWidth: options.footprintWidth,
				footprintHeight: options.footprintHeight,
				height: options.height,
			},
			{
				shape: "buildingDetail",
				footprintWidth: options.footprintWidth,
				footprintHeight: options.footprintHeight,
				height: options.height,
				tint: 0xffffff,
				windowRows: options.windowRows,
				windowColumns: options.windowColumns,
				windowColor: options.windowColor,
				roofColor: options.roofColor,
				doorColor: options.doorColor,
			},
		],
		interactionPoints: [],
	};
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
		solid: true,
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
		// Seats block transit but are reachable as a terminal "sit" step, so
		// agents walk around them rather than over them.
		solid: true,
		baseTint: 0x7a5a3c,
		parts: [{ shape: "chair", offsetTileX: 0.19, offsetTileY: 0.19 }],
		interactionPoints: [sit(0, 0, "right", 6)],
	},
	stool: {
		footprintWidth: 1,
		footprintHeight: 1,
		solid: true,
		baseTint: 0x8a6442,
		parts: [
			{
				shape: "cuboid",
				footprintWidth: 0.5,
				footprintHeight: 0.5,
				height: 16,
				offsetTileX: 0.25,
				offsetTileY: 0.25,
			},
		],
		interactionPoints: [sit(0, 0, "right", 4)],
	},
	lamp: {
		footprintWidth: 1,
		footprintHeight: 1,
		solid: true,
		baseTint: 0x3a3f4a,
		parts: [
			{
				shape: "cuboid",
				footprintWidth: 0.16,
				footprintHeight: 0.16,
				height: 42,
				offsetTileX: 0.42,
				offsetTileY: 0.42,
			},
			{
				shape: "cuboid",
				footprintWidth: 0.5,
				footprintHeight: 0.5,
				height: 9,
				offsetTileX: 0.25,
				offsetTileY: 0.25,
				lift: 42,
				tint: 0xffe9a8,
			},
		],
		interactionPoints: [],
	},
	crate: {
		footprintWidth: 1,
		footprintHeight: 1,
		solid: true,
		baseTint: 0x9a7042,
		parts: [
			{
				shape: "cuboid",
				footprintWidth: 0.8,
				footprintHeight: 0.8,
				height: 20,
				offsetTileX: 0.1,
				offsetTileY: 0.1,
			},
		],
		interactionPoints: [
			{ tileOffsetX: 0, tileOffsetY: 1, action: "inspect", facing: "left" },
		],
	},
	painting: {
		footprintWidth: 1,
		footprintHeight: 1,
		solid: true,
		baseTint: 0xc9a878,
		parts: [
			{
				shape: "cuboid",
				footprintWidth: 1,
				footprintHeight: 0.14,
				height: 26,
				offsetTileY: 0.42,
				lift: 8,
			},
			{
				shape: "cuboid",
				footprintWidth: 0.78,
				footprintHeight: 0.1,
				height: 20,
				offsetTileX: 0.11,
				offsetTileY: 0.44,
				lift: 11,
				tint: 0x5a8fb0,
			},
		],
		interactionPoints: [
			{ tileOffsetX: 0, tileOffsetY: 1, action: "inspect", facing: "left" },
		],
	},
	barCounter: {
		footprintWidth: 3,
		footprintHeight: 1,
		solid: true,
		baseTint: 0x5a3d28,
		parts: [
			{ shape: "cuboid", footprintWidth: 3, footprintHeight: 1, height: 24 },
			{
				shape: "decal",
				footprintWidth: 3,
				footprintHeight: 0.6,
				offsetTileY: 0.1,
				lift: 24,
				tint: 0x2a2d3a,
			},
		],
		interactionPoints: [],
	},
	trophy: {
		footprintWidth: 1,
		footprintHeight: 1,
		solid: true,
		baseTint: 0xf5c542,
		parts: [
			{
				shape: "cuboid",
				footprintWidth: 0.4,
				footprintHeight: 0.4,
				height: 8,
				offsetTileX: 0.3,
				offsetTileY: 0.3,
			},
			{
				shape: "cuboid",
				footprintWidth: 0.3,
				footprintHeight: 0.3,
				height: 12,
				offsetTileX: 0.35,
				offsetTileY: 0.35,
				lift: 8,
			},
		],
		interactionPoints: [
			{ tileOffsetX: 0, tileOffsetY: 1, action: "inspect", facing: "left" },
		],
	},
	fern: {
		footprintWidth: 1,
		footprintHeight: 1,
		solid: true,
		baseTint: 0x9a6b4a,
		parts: [
			{
				shape: "cuboid",
				footprintWidth: 0.4,
				footprintHeight: 0.4,
				height: 14,
				offsetTileX: 0.3,
				offsetTileY: 0.3,
			},
			{
				shape: "cuboid",
				footprintWidth: 0.72,
				footprintHeight: 0.72,
				height: 14,
				offsetTileX: 0.14,
				offsetTileY: 0.14,
				lift: 14,
				tint: 0x4e9f5a,
			},
			{
				shape: "cuboid",
				footprintWidth: 0.46,
				footprintHeight: 0.46,
				height: 12,
				offsetTileX: 0.27,
				offsetTileY: 0.27,
				lift: 26,
				tint: 0x3f8f53,
			},
		],
		interactionPoints: [],
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
	// ---- Outdoor buildings --------------------------------------------------
	house: buildingBlueprint({
		footprintWidth: 3,
		footprintHeight: 3,
		height: 48,
		bodyTint: 0xb98a6b,
		windowRows: 2,
		windowColumns: 2,
		windowColor: 0xffe9a8,
		roofColor: 0x9a4b3c,
		doorColor: 0x5a3d28,
	}),
	shop: buildingBlueprint({
		footprintWidth: 3,
		footprintHeight: 2,
		height: 40,
		bodyTint: 0xc98b6a,
		windowRows: 1,
		windowColumns: 3,
		windowColor: 0x9ad0ec,
		roofColor: 0x3f7d6a,
		doorColor: 0x4a3526,
	}),
	cafe: buildingBlueprint({
		footprintWidth: 3,
		footprintHeight: 2,
		height: 44,
		bodyTint: 0xa86b8a,
		windowRows: 1,
		windowColumns: 3,
		windowColor: 0xffd9a8,
		roofColor: 0xb04a4a,
		doorColor: 0x5a3d28,
	}),
	tower: buildingBlueprint({
		footprintWidth: 2,
		footprintHeight: 2,
		height: 96,
		bodyTint: 0x8a9bb0,
		windowRows: 5,
		windowColumns: 2,
		windowColor: 0xffe9a8,
		roofColor: 0x55606e,
		doorColor: 0x2a2d3a,
	}),
	fountain: {
		footprintWidth: 2,
		footprintHeight: 2,
		solid: true,
		baseTint: 0x9298a4,
		parts: [
			{ shape: "cuboid", footprintWidth: 2, footprintHeight: 2, height: 10 },
			{
				shape: "decal",
				footprintWidth: 1.6,
				footprintHeight: 1.6,
				offsetTileX: 0.2,
				offsetTileY: 0.2,
				lift: 10,
				tint: 0x5aa9e6,
			},
			{
				shape: "cuboid",
				footprintWidth: 0.36,
				footprintHeight: 0.36,
				height: 16,
				offsetTileX: 0.82,
				offsetTileY: 0.82,
				lift: 10,
				tint: 0xbfe3f5,
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

		// A soft contact shadow grounds the piece (skipped for flat decals).
		if (!blueprint.flat) {
			const shadow = factory.contactShadow(
				this.footprintWidth,
				this.footprintHeight
			);
			const shadowSprite = new Sprite(shadow.texture);
			shadowSprite.pivot.set(shadow.anchorX, shadow.anchorY);
			this.addChild(shadowSprite);
		}

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
				case "buildingDetail":
					return factory.buildingDetail(
						part.footprintWidth ?? 2,
						part.footprintHeight ?? 2,
						part.height ?? 40,
						{
							windowRows: part.windowRows ?? 2,
							windowColumns: part.windowColumns ?? 2,
							windowColor: part.windowColor ?? 0xffe9a8,
							roofColor: part.roofColor ?? 0x8a4b3c,
							doorColor: part.doorColor ?? 0x4a3526,
						}
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

	/** Every tile under the piece, regardless of whether it blocks. */
	public footprintTiles(): Array<{ x: number; y: number }> {
		const tiles: Array<{ x: number; y: number }> = [];
		for (let column = 0; column < this.footprintWidth; column++) {
			for (let row = 0; row < this.footprintHeight; row++) {
				tiles.push({ x: this.tileX + column, y: this.tileY + row });
			}
		}
		return tiles;
	}

	/** Tiles this piece blocks for transit (empty if it is walkable). */
	public solidTiles(): Array<{ x: number; y: number }> {
		return this.solid ? this.footprintTiles() : [];
	}

	/** Tiles an agent may stand on as a terminal "sit" step. */
	public seatTiles(): Array<{ x: number; y: number }> {
		return this.stationPoints
			.filter((point) => point.action === "sit")
			.map((point) => ({
				x: this.tileX + point.tileOffsetX,
				y: this.tileY + point.tileOffsetY,
			}));
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
