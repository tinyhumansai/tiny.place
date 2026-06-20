/**
 * Abstract isometric room.
 *
 * A room is built entirely from its {@link RoomDefinition}: a 2D matrix of tile
 * codes (void / floor / wall / dais), a five-shade palette, and a list of
 * furniture placements. `BaseRoom` turns that data into a depth-sorted scene
 * graph and the navigation state the simulation needs — a walkable set, a
 * per-tile elevation lookup, and a map of interaction stations.
 *
 * Concrete rooms (poker, courthouse, office, home) extend this class and supply
 * their definition, so new room types are pure data.
 */

import { Container, Sprite } from "pixi.js";

import { shadeColor } from "./color";
import { FurnitureSprite, type FurnitureStation } from "./furniture";
import {
	ELEVATION_HEIGHT,
	LAYER_DECAL,
	LAYER_FLOOR,
	LAYER_WALL,
	depthAt,
	tileToScreen,
	type ScreenPoint,
} from "./geometry";
import type { TextureFactory } from "./textures";
import {
	TileCode,
	type RoomDefinition,
	type RoomPalette,
	type WalkNode,
} from "./types";

const WALL_HEIGHT = 78;
const PARTITION_HEIGHT = 34;
const NEIGHBOR_STEPS: ReadonlyArray<readonly [number, number]> = [
	[0, -1],
	[1, 0],
	[0, 1],
	[-1, 0],
	[1, -1],
	[1, 1],
	[-1, 1],
	[-1, -1],
];

function tileKey(tileX: number, tileY: number): string {
	return `${tileX},${tileY}`;
}

/** A furniture footprint plus its render depth, used to sort agents around it. */
export interface DepthObstacle {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
	zIndex: number;
}

export abstract class BaseRoom {
	public readonly view: Container = new Container();
	public readonly definition: RoomDefinition;

	private readonly columns: number;
	private readonly rows: number;
	private readonly levelGrid: Array<Array<number>> = [];
	private readonly walkable = new Set<string>();
	private readonly seats = new Set<string>();
	private readonly stationsByTile = new Map<string, FurnitureStation>();
	private readonly pieceByTile = new Map<string, FurnitureSprite>();
	private readonly obstacles: Array<DepthObstacle> = [];
	private readonly center: ScreenPoint;
	private readonly size: { width: number; height: number };

	protected constructor(definition: RoomDefinition, factory: TextureFactory) {
		this.definition = definition;
		this.view.sortableChildren = true;
		this.rows = definition.matrix.length;
		this.columns = definition.matrix.reduce(
			(widest, row) => Math.max(widest, row.length),
			0
		);

		this.buildTiles(factory, definition.palette);
		this.buildFurniture(factory, definition);
		const bounds = this.computeBounds();
		this.center = { x: bounds.centerX, y: bounds.centerY };
		this.size = { width: bounds.width, height: bounds.height };
	}

	// ---- Scene construction -------------------------------------------------

	private buildTiles(factory: TextureFactory, palette: RoomPalette): void {
		const floor = factory.floorTile();
		for (let row = 0; row < this.rows; row++) {
			this.levelGrid.push(new Array<number>(this.columns).fill(-1));
			const matrixRow = this.definition.matrix[row] ?? [];
			for (let column = 0; column < this.columns; column++) {
				const code = matrixRow[column] ?? TileCode.Void;
				if (code === TileCode.Void) {
					continue;
				}
				if (code === TileCode.Wall) {
					this.placeWall(factory, palette, column, row);
					continue;
				}
				if (code === TileCode.Partition) {
					// A divider stands on visible floor but is not walkable.
					this.placeFloor(floor, palette, column, row, 0);
					this.placePartition(factory, palette, column, row);
					continue;
				}
				const level = code === TileCode.Dais ? 1 : 0;
				if (level === 1) {
					this.placeDaisRiser(factory, palette, column, row);
				}
				this.placeFloor(floor, palette, column, row, level);
				this.levelGrid[row]![column] = level;
				this.walkable.add(tileKey(column, row));
			}
		}
	}

	private placeFloor(
		floor: ReturnType<TextureFactory["floorTile"]>,
		palette: RoomPalette,
		column: number,
		row: number,
		level: number
	): void {
		const sprite = new Sprite(floor.texture);
		sprite.pivot.set(floor.anchorX, floor.anchorY);
		const screen = tileToScreen(column, row, level);
		sprite.position.set(screen.x, screen.y);
		// A faint checker keeps large floors from looking flat.
		const isDark = (column + row) % 2 === 0;
		sprite.tint = isDark
			? shadeColor(palette.floorTop, 0.93)
			: palette.floorTop;
		sprite.zIndex = depthAt(column, row, level, LAYER_FLOOR);
		this.view.addChild(sprite);
	}

	private placeDaisRiser(
		factory: TextureFactory,
		palette: RoomPalette,
		column: number,
		row: number
	): void {
		const riser = factory.cuboid(1, 1, ELEVATION_HEIGHT, "dais-riser");
		const sprite = new Sprite(riser.texture);
		sprite.pivot.set(riser.anchorX, riser.anchorY);
		const screen = tileToScreen(column, row, 0);
		sprite.position.set(screen.x, screen.y);
		sprite.tint = palette.dais;
		sprite.zIndex = depthAt(column, row, 0, LAYER_DECAL);
		this.view.addChild(sprite);
	}

	private placeWall(
		factory: TextureFactory,
		palette: RoomPalette,
		column: number,
		row: number
	): void {
		const wall = factory.wallBlock(WALL_HEIGHT);
		const sprite = new Sprite(wall.texture);
		sprite.pivot.set(wall.anchorX, wall.anchorY);
		const screen = tileToScreen(column, row, 0);
		sprite.position.set(screen.x, screen.y);
		sprite.tint = palette.wall;
		sprite.zIndex = depthAt(column, row, 0, LAYER_WALL);
		this.view.addChild(sprite);
	}

	private placePartition(
		factory: TextureFactory,
		palette: RoomPalette,
		column: number,
		row: number
	): void {
		const partition = factory.wallBlock(PARTITION_HEIGHT);
		const sprite = new Sprite(partition.texture);
		sprite.pivot.set(partition.anchorX, partition.anchorY);
		const screen = tileToScreen(column, row, 0);
		sprite.position.set(screen.x, screen.y);
		sprite.tint = palette.wall;
		sprite.zIndex = depthAt(column, row, 0, LAYER_WALL);
		this.view.addChild(sprite);
		this.obstacles.push({
			minX: column,
			maxX: column,
			minY: row,
			maxY: row,
			zIndex: sprite.zIndex,
		});
	}

	private buildFurniture(
		factory: TextureFactory,
		definition: RoomDefinition
	): void {
		for (const config of definition.furniture) {
			const piece = new FurnitureSprite(config, factory);
			this.view.addChild(piece);
			for (const tile of piece.footprintTiles()) {
				this.pieceByTile.set(tileKey(tile.x, tile.y), piece);
			}
			// Solid tiles leave the transit graph entirely...
			for (const tile of piece.solidTiles()) {
				this.walkable.delete(tileKey(tile.x, tile.y));
			}
			// ...but seat tiles remain reachable as a terminal sit step.
			for (const tile of piece.seatTiles()) {
				this.seats.add(tileKey(tile.x, tile.y));
			}
			for (const station of piece.stations()) {
				this.stationsByTile.set(tileKey(station.tileX, station.tileY), station);
			}
			// Solid pieces occlude agents; record their footprint + depth so the
			// renderer can sort agents around them by proper point-vs-box order.
			if (piece.solid) {
				this.obstacles.push({
					minX: piece.tileX,
					maxX: piece.tileX + piece.footprintWidth - 1,
					minY: piece.tileY,
					maxY: piece.tileY + piece.footprintHeight - 1,
					zIndex: piece.zIndex,
				});
			}
		}
	}

	/** Solid furniture footprints + depths, for agent depth resolution. */
	public depthObstacles(): ReadonlyArray<DepthObstacle> {
		return this.obstacles;
	}

	private computeBounds(): {
		centerX: number;
		centerY: number;
		width: number;
		height: number;
	} {
		let minX = Number.POSITIVE_INFINITY;
		let minY = Number.POSITIVE_INFINITY;
		let maxX = Number.NEGATIVE_INFINITY;
		let maxY = Number.NEGATIVE_INFINITY;
		for (let row = 0; row < this.rows; row++) {
			for (let column = 0; column < this.columns; column++) {
				if ((this.definition.matrix[row]?.[column] ?? 0) === TileCode.Void) {
					continue;
				}
				// Sample all four diamond corners so the extents are exact.
				for (const [cornerX, cornerY] of [
					[column, row],
					[column + 1, row],
					[column + 1, row + 1],
					[column, row + 1],
				]) {
					const screen = tileToScreen(cornerX!, cornerY!, 0);
					minX = Math.min(minX, screen.x);
					maxX = Math.max(maxX, screen.x);
					minY = Math.min(minY, screen.y);
					maxY = Math.max(maxY, screen.y);
				}
			}
		}
		// Pad vertically for wall/building height and overhead chat bubbles.
		const topMargin = this.definition.topMargin ?? WALL_HEIGHT;
		return {
			centerX: (minX + maxX) / 2,
			centerY: (minY + maxY) / 2 - (topMargin - WALL_HEIGHT) / 2,
			width: maxX - minX,
			height: maxY - minY + topMargin,
		};
	}

	// ---- Navigation API -----------------------------------------------------

	public get pixelCenter(): ScreenPoint {
		return this.center;
	}

	public get pixelSize(): { width: number; height: number } {
		return this.size;
	}

	public levelAt(tileX: number, tileY: number): number {
		return this.levelGrid[tileY]?.[tileX] ?? 0;
	}

	public isWalkable(tileX: number, tileY: number): boolean {
		return this.walkable.has(tileKey(tileX, tileY));
	}

	/** A seat tile is occupiable only as the final step of a sit. */
	public isSeat(tileX: number, tileY: number): boolean {
		return this.seats.has(tileKey(tileX, tileY));
	}

	/** Interaction stations of the furniture occupying a tile, if any. */
	public pieceStationsAt(
		tileX: number,
		tileY: number
	): Array<FurnitureStation> {
		return this.pieceByTile.get(tileKey(tileX, tileY))?.stations() ?? [];
	}

	public node(tileX: number, tileY: number): WalkNode {
		return { x: tileX, y: tileY, level: this.levelAt(tileX, tileY) };
	}

	public stationAt(tileX: number, tileY: number): FurnitureStation | undefined {
		return this.stationsByTile.get(tileKey(tileX, tileY));
	}

	public stations(): Array<FurnitureStation> {
		return [...this.stationsByTile.values()];
	}

	public spawnNode(): WalkNode {
		const { x, y } = this.definition.spawnTile;
		if (this.isWalkable(x, y)) {
			return this.node(x, y);
		}
		return this.walkableNodes()[0] ?? { x, y, level: 0 };
	}

	public walkableNodes(): Array<WalkNode> {
		const nodes: Array<WalkNode> = [];
		for (const key of this.walkable) {
			const [tileX, tileY] = key.split(",").map(Number);
			nodes.push(this.node(tileX!, tileY!));
		}
		return nodes;
	}

	/**
	 * Breadth-first path between two tiles. Returns the steps *after* the start
	 * (empty when already there), or `null` if unreachable. Diagonal moves are
	 * blocked from cutting through solid corners, and elevation can only change
	 * by one level per step.
	 */
	public findPath(
		startX: number,
		startY: number,
		endX: number,
		endY: number,
		blocked?: Set<string>
	): Array<WalkNode> | null {
		const canStand = (x: number, y: number): boolean =>
			this.isWalkable(x, y) || this.isSeat(x, y);
		if (!canStand(startX, startY) || !canStand(endX, endY)) {
			return null;
		}
		if (startX === endX && startY === endY) {
			return [];
		}

		const visited = new Set<string>([tileKey(startX, startY)]);
		const queue: Array<{ x: number; y: number; path: Array<WalkNode> }> = [
			{ x: startX, y: startY, path: [] },
		];

		while (queue.length > 0) {
			const current = queue.shift()!;
			for (const [stepX, stepY] of NEIGHBOR_STEPS) {
				const nextX = current.x + stepX;
				const nextY = current.y + stepY;
				const key = tileKey(nextX, nextY);
				if (visited.has(key)) {
					continue;
				}
				const terminal = nextX === endX && nextY === endY;
				// Seats may only be entered as the destination; otherwise the tile
				// must be normal walkable floor.
				if (this.isSeat(nextX, nextY)) {
					if (!terminal) {
						continue;
					}
				} else if (!this.isWalkable(nextX, nextY)) {
					continue;
				}
				if (blocked?.has(key) && !terminal) {
					continue;
				}
				// Disallow diagonal corner-cutting past blocking tiles.
				if (stepX !== 0 && stepY !== 0) {
					if (
						!this.isWalkable(current.x + stepX, current.y) ||
						!this.isWalkable(current.x, current.y + stepY)
					) {
						continue;
					}
				}
				if (
					Math.abs(
						this.levelAt(nextX, nextY) - this.levelAt(current.x, current.y)
					) > 1
				) {
					continue;
				}
				const next = this.node(nextX, nextY);
				const path = [...current.path, next];
				if (terminal) {
					return path;
				}
				visited.add(key);
				queue.push({ x: nextX, y: nextY, path });
			}
		}
		return null;
	}
}
