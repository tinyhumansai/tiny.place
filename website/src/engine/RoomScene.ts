import * as Phaser from "phaser";
import type RoomModel from "./RoomModel";
import RoomTileRenderer from "./RoomTileRenderer";
import { type RoomTheme, DEFAULT_THEME } from "./RoomTheme";
import { FurnitureRenderer, FURNITURE_LAYOUTS } from "./furniture";
import {
	generateAllTextures,
	getTextureKey,
	appearanceFromFigure,
} from "./SvgAvatarRenderer";
import type { Direction, AvatarAction } from "./types";
import {
	ROOM_TILE_WIDTH,
	ROOM_TILE_HEIGHT,
	ROOM_WALL_L_OFFSET_X,
	ROOM_WALL_L_OFFSET_Y,
	ROOM_WALL_R_OFFSET_X,
	ROOM_WALL_R_OFFSET_Y,
	PRIORITY_WALL,
	PRIORITY_FLOOR,
	PRIORITY_DOOR_FLOOR,
	PRIORITY_PLAYER,
	PRIORITY_PLAYER_SHADOW,
	PRIORITY_ROOM_ITEM,
	PRIORITY_MULTIPLIER,
	COMPARABLE_X_Y,
	COMPARABLE_Z,
} from "./constants";

const CAMERA_CENTERED_OFFSET_Y = 150;
const FRAME_SPEED = 100;
const WALK_STEP_DURATION = 400;
const IDLE_MIN_MS = 1500;
const IDLE_MAX_MS = 5000;
const AVATAR_SPRITE_OFFSET_X = 3;
const AVATAR_SPRITE_OFFSET_Y = -70;

interface RoomAvatarState {
	id: number;
	name: string;
	figure: string;
	textureKeyPrefix: string;
	x: number;
	y: number;
	z: number;
	direction: Direction;
	sprite: Phaser.GameObjects.Sprite;
	shadow: Phaser.GameObjects.Image | null;
	loaded: boolean;
	frame: number;
	frameCounter: number;
	action: AvatarAction;
	path: Array<{ x: number; y: number }>;
	walkProgress: number;
	previousX: number;
	previousY: number;
	previousZ: number;
	targetX: number;
	targetY: number;
	targetZ: number;
	idleTimer: number;
	waveTimer: number;
	autonomy: boolean;
}

function calculateZIndex(
	x: number,
	y: number,
	z: number,
	priority: number
): number {
	return (
		(x + y) * COMPARABLE_X_Y + z * COMPARABLE_Z + PRIORITY_MULTIPLIER * priority
	);
}

function tileToLocal(
	x: number,
	y: number,
	z: number
): { x: number; y: number } {
	return {
		x: (x - y) * ROOM_TILE_WIDTH,
		y: (x + y) * ROOM_TILE_HEIGHT - z * ROOM_TILE_HEIGHT * 2,
	};
}

function randomBetween(min: number, max: number): number {
	return min + Math.random() * (max - min);
}

function directionFromDelta(dx: number, dy: number): Direction {
	if (dx === 0 && dy === -1) return 0;
	if (dx === 1 && dy === -1) return 1;
	if (dx === 1 && dy === 0) return 2;
	if (dx === 1 && dy === 1) return 3;
	if (dx === 0 && dy === 1) return 4;
	if (dx === -1 && dy === 1) return 5;
	if (dx === -1 && dy === 0) return 6;
	if (dx === -1 && dy === -1) return 7;
	return 2;
}

export default class RoomScene extends Phaser.Scene {
	private readonly tileRenderer: RoomTileRenderer;
	private readonly furnitureRenderer: FurnitureRenderer;
	private furnitureSprites: Array<Phaser.GameObjects.Image>;
	public currentModel: RoomModel | null;
	private readonly avatars: Map<number, RoomAvatarState>;
	private currentTheme: RoomTheme;
	private isDragging: boolean;
	private lastPointerX: number;
	private lastPointerY: number;
	private dragEnabled: boolean;
	private cameraOffsetY: number;

	public constructor() {
		super({ key: "RoomScene" });
		this.dragEnabled = true;
		this.cameraOffsetY = CAMERA_CENTERED_OFFSET_Y;
		this.tileRenderer = new RoomTileRenderer();
		this.furnitureRenderer = new FurnitureRenderer();
		this.furnitureSprites = [];
		this.currentModel = null;
		this.currentTheme = DEFAULT_THEME;
		this.avatars = new Map();
		this.isDragging = false;
		this.lastPointerX = 0;
		this.lastPointerY = 0;
	}

	public create(): void {
		try {
			this.load.image("shadow_tile", "assets/shadow_tile.png");
			this.load.start();
		} catch {
			// shadow tile is optional
		}

		this.setupInput();
	}

	public override update(_time: number, delta: number): void {
		for (const avatar of this.avatars.values()) {
			avatar.frameCounter += delta;
			if (avatar.frameCounter >= FRAME_SPEED) {
				avatar.frame++;
				avatar.frameCounter = 0;
				this.updateAvatarTexture(avatar);
			}

			if (avatar.action === "walking") {
				this.updateWalking(avatar, delta);
			}

			this.updateAutonomy(avatar, delta);
		}
	}

	public setDragEnabled(enabled: boolean): void {
		this.dragEnabled = enabled;
		if (!enabled) this.isDragging = false;
	}

	public setCameraOffsetY(offset: number): void {
		this.cameraOffsetY = offset;
	}

	private setupInput(): void {
		this.input.on("pointerdown", (pointer: Phaser.Input.Pointer): void => {
			if (!this.dragEnabled) return;
			this.isDragging = true;
			this.lastPointerX = pointer.x;
			this.lastPointerY = pointer.y;
		});

		this.input.on("pointermove", (pointer: Phaser.Input.Pointer): void => {
			if (this.isDragging) {
				const dx = pointer.x - this.lastPointerX;
				const dy = pointer.y - this.lastPointerY;
				this.cameras.main.scrollX -= dx;
				this.cameras.main.scrollY -= dy;
			}
			this.lastPointerX = pointer.x;
			this.lastPointerY = pointer.y;
		});

		this.input.on("pointerup", (): void => {
			this.isDragging = false;
		});
	}

	public centerCamera(): void {
		if (!this.currentModel) return;
		const door = tileToLocal(
			this.currentModel.doorX,
			this.currentModel.doorY,
			0
		);
		this.cameras.main.centerOn(door.x, door.y + this.cameraOffsetY);
	}

	public loadRoom(model: RoomModel, theme: RoomTheme = DEFAULT_THEME): void {
		this.clearRoom();
		this.currentModel = model;
		this.currentTheme = theme;

		this.tileRenderer.initialize(this, theme);
		this.cameras.main.setBackgroundColor(theme.backgroundColor);

		let maxHeight = 1;
		for (let x = 0; x < model.maxX; x++) {
			for (let y = 0; y < model.maxY; y++) {
				const tile = model.getTile(x, y);
				if (tile > maxHeight) maxHeight = tile;
			}
		}

		this.renderWalls(model, maxHeight);
		this.renderFloor(model);
		void this.renderFurniture(theme);
		this.centerCamera();
	}

	public clearRoom(): void {
		this.children.removeAll(true);
		for (const avatar of this.avatars.values()) {
			this.removeAvatarTextures(avatar);
		}
		this.avatars.clear();
		this.furnitureSprites = [];
		this.currentModel = null;
	}

	private renderWalls(model: RoomModel, maxHeight: number): void {
		const theme = this.currentTheme;
		let minY = model.maxX;

		for (let x = 0; x < model.maxX; x++) {
			for (let y = 0; y < model.maxY; y++) {
				const tile = model.getTile(x, y);
				if ((model.doorX !== x || model.doorY !== y) && tile > 0 && y <= minY) {
					if (minY > y) minY = y;
					const key = this.tileRenderer.getWallRKey(
						this,
						maxHeight - tile,
						theme
					);
					const local = tileToLocal(x, y + 1, maxHeight - 1);
					const wall = this.add.image(
						local.x + ROOM_WALL_R_OFFSET_X,
						local.y + ROOM_WALL_R_OFFSET_Y + 4,
						key
					);
					wall.setOrigin(0, 0);
					wall.setDepth(calculateZIndex(x, y + 1, 0, PRIORITY_WALL));
				}
			}
		}

		for (let y = 0; y < model.maxY; y++) {
			for (let x = 0; x < model.maxX; x++) {
				const tile = model.getTile(x, y);
				if ((model.doorX !== x || model.doorY !== y) && tile > 0) {
					let key: string;
					if (y === model.doorY) {
						key = this.tileRenderer.getDoorLKey(this, theme);
					} else if (y === model.doorY - 1) {
						key = this.tileRenderer.getDoorBeforeLKey(
							this,
							maxHeight - tile,
							theme
						);
					} else {
						key = this.tileRenderer.getWallLKey(this, maxHeight - tile, theme);
					}
					const local = tileToLocal(x, y, maxHeight - 1);
					const wall = this.add.image(
						local.x + ROOM_WALL_L_OFFSET_X,
						local.y + ROOM_WALL_L_OFFSET_Y + 4,
						key
					);
					wall.setOrigin(0, 0);
					wall.setDepth(calculateZIndex(x, y, 0, PRIORITY_WALL));
					break;
				}
			}
		}
	}

	private renderFloor(model: RoomModel): void {
		const floorKey = this.tileRenderer.getFloorTileKey();
		const stairLKey = this.tileRenderer.getStairLKey();
		const stairRKey = this.tileRenderer.getStairRKey();

		for (let x = 0; x < model.maxX; x++) {
			for (let y = 0; y < model.maxY; y++) {
				const tile = model.getTile(x, y);
				if (tile <= 0) continue;

				let textureKey = floorKey;

				if (model.isValidTile(x + 1, y) && model.getTile(x + 1, y) < tile) {
					textureKey = stairLKey;
				} else if (
					model.isValidTile(x - 1, y) &&
					model.getTile(x - 1, y) > tile
				) {
					continue;
				} else if (
					model.isValidTile(x, y - 1) &&
					model.getTile(x, y - 1) > tile
				) {
					continue;
				} else if (
					model.isValidTile(x, y + 1) &&
					model.getTile(x, y + 1) < tile
				) {
					if (this.textures.exists(stairRKey)) {
						const local = tileToLocal(x, y, tile - 1);
						const stair = this.add.image(local.x - 34, local.y, stairRKey);
						stair.setOrigin(0, 0);
						stair.setDepth(
							calculateZIndex(
								x,
								y,
								0,
								model.doorX === x && model.doorY === y
									? PRIORITY_DOOR_FLOOR
									: PRIORITY_FLOOR
							)
						);
						continue;
					}
				}

				const local = tileToLocal(x, y, tile - 1);
				const floorTile = this.add.image(local.x, local.y, textureKey);
				floorTile.setOrigin(0, 0);
				floorTile.setDepth(
					calculateZIndex(
						x,
						y,
						0,
						model.doorX === x && model.doorY === y
							? PRIORITY_DOOR_FLOOR
							: PRIORITY_FLOOR
					)
				);
			}
		}
	}

	private async renderFurniture(theme: RoomTheme): Promise<void> {
		const layout = FURNITURE_LAYOUTS[theme.id];
		if (!layout) return;

		const itemTypes = [...new Set(layout.items.map((item) => item.itemType))];
		await this.furnitureRenderer.initializeForRoom(this, itemTypes);

		for (const item of layout.items) {
			const textureKey = this.furnitureRenderer.getTextureKey(item.itemType);
			if (!this.textures.exists(textureKey)) continue;

			const local = tileToLocal(item.tileX, item.tileY, item.tileZ - 1);
			const sprite = this.add.image(
				local.x + (item.offsetX ?? 0),
				local.y + (item.offsetY ?? 0),
				textureKey
			);
			sprite.setOrigin(0.5, 0.5);
			sprite.setDepth(
				calculateZIndex(
					Math.floor(item.tileX),
					Math.floor(item.tileY),
					item.tileZ,
					PRIORITY_ROOM_ITEM
				)
			);
			this.furnitureSprites.push(sprite);
		}
	}

	public async addAvatar(
		id: number,
		name: string,
		figure: string,
		x: number,
		y: number,
		z: number,
		direction: Direction
	): Promise<void> {
		if (!this.currentModel) return;

		const appearance = appearanceFromFigure(figure);
		const keyPrefix = `avatar_${id}`;

		await generateAllTextures(this, keyPrefix, appearance);

		const tileZ = this.currentModel.isValidTile(x, y)
			? this.currentModel.getTile(x, y) - 1
			: 0;
		const effectiveZ = z + tileZ;

		const { key, flipX } = getTextureKey(keyPrefix, direction, "idle", 0);
		const sprite = this.add.sprite(0, 0, key);
		sprite.setOrigin(0, 0);
		sprite.setFlipX(flipX);

		let shadow: Phaser.GameObjects.Image | null = null;
		if (this.textures.exists("shadow_tile")) {
			shadow = this.add.image(0, 0, "shadow_tile");
			shadow.setOrigin(0, 0);
		}

		const avatar: RoomAvatarState = {
			id,
			name,
			figure,
			textureKeyPrefix: keyPrefix,
			x,
			y,
			z: effectiveZ,
			direction,
			sprite,
			shadow,
			loaded: true,
			frame: 0,
			frameCounter: 0,
			action: "idle",
			path: [],
			walkProgress: 0,
			previousX: x,
			previousY: y,
			previousZ: effectiveZ,
			targetX: x,
			targetY: y,
			targetZ: effectiveZ,
			idleTimer: 0,
			waveTimer: 0,
			autonomy: false,
		};

		this.avatars.set(id, avatar);
		this.updateAvatarSpritePosition(avatar);
		this.updateAvatarTexture(avatar);
	}

	public removeAvatar(id: number): void {
		const avatar = this.avatars.get(id);
		if (!avatar) return;
		avatar.sprite.destroy();
		if (avatar.shadow) avatar.shadow.destroy();
		this.removeAvatarTextures(avatar);
		this.avatars.delete(id);
	}

	private removeAvatarTextures(avatar: RoomAvatarState): void {
		const prefix = avatar.textureKeyPrefix;
		for (const key of this.textures.getTextureKeys()) {
			if (key.startsWith(prefix)) {
				this.textures.remove(key);
			}
		}
	}

	public moveAvatar(
		id: number,
		x: number,
		y: number,
		direction: Direction
	): void {
		const avatar = this.avatars.get(id);
		if (!avatar || !this.currentModel) return;
		avatar.x = x;
		avatar.y = y;
		avatar.direction = direction;
		if (this.currentModel.isValidTile(x, y)) {
			avatar.z = this.currentModel.getTile(x, y) - 1;
		}
		this.updateAvatarSpritePosition(avatar);
		this.updateAvatarTexture(avatar);
	}

	public enableAutonomy(id: number): void {
		const avatar = this.avatars.get(id);
		if (avatar) {
			avatar.autonomy = true;
			avatar.idleTimer = randomBetween(IDLE_MIN_MS, IDLE_MAX_MS);
		}
	}

	private updateAvatarTexture(avatar: RoomAvatarState): void {
		if (!avatar.loaded) return;
		const frameCount =
			avatar.action === "walking" ? 4 : avatar.action === "waving" ? 2 : 1;
		const { key, flipX } = getTextureKey(
			avatar.textureKeyPrefix,
			avatar.direction,
			avatar.action,
			avatar.frame % frameCount
		);
		if (this.textures.exists(key)) {
			avatar.sprite.setTexture(key);
			avatar.sprite.setFlipX(flipX);
		}
	}

	private updateAvatarSpritePosition(avatar: RoomAvatarState): void {
		const local = tileToLocal(avatar.x, avatar.y, avatar.z);
		const offsetX =
			avatar.direction >= 4 && avatar.direction <= 6
				? AVATAR_SPRITE_OFFSET_X
				: 0;
		avatar.sprite.setPosition(
			Math.round(local.x + offsetX),
			Math.round(local.y + AVATAR_SPRITE_OFFSET_Y)
		);
		avatar.sprite.setDepth(
			calculateZIndex(avatar.x, avatar.y, avatar.z, PRIORITY_PLAYER)
		);

		if (avatar.shadow) {
			avatar.shadow.setPosition(local.x, local.y);
			avatar.shadow.setDepth(
				calculateZIndex(avatar.x, avatar.y, 0, PRIORITY_PLAYER_SHADOW)
			);
		}
	}

	private beginNextWalkStep(avatar: RoomAvatarState): void {
		if (avatar.path.length === 0) {
			avatar.action = "idle";
			avatar.idleTimer = randomBetween(IDLE_MIN_MS, IDLE_MAX_MS);
			return;
		}

		const next = avatar.path.shift()!;
		avatar.previousX = avatar.x;
		avatar.previousY = avatar.y;
		avatar.previousZ = avatar.z;
		avatar.targetX = next.x;
		avatar.targetY = next.y;
		avatar.targetZ = this.currentModel
			? this.currentModel.getTile(next.x, next.y) - 1
			: 0;
		avatar.walkProgress = 0;

		const dx = Math.sign(next.x - avatar.previousX);
		const dy = Math.sign(next.y - avatar.previousY);
		avatar.direction = directionFromDelta(dx, dy);
	}

	private updateWalking(avatar: RoomAvatarState, deltaMs: number): void {
		avatar.walkProgress += deltaMs / WALK_STEP_DURATION;

		if (avatar.walkProgress >= 1) {
			avatar.x = avatar.targetX;
			avatar.y = avatar.targetY;
			avatar.z = avatar.targetZ;
			this.updateAvatarSpritePosition(avatar);
			this.beginNextWalkStep(avatar);
			return;
		}

		const t = avatar.walkProgress;
		const visualX = avatar.previousX + (avatar.targetX - avatar.previousX) * t;
		const visualY = avatar.previousY + (avatar.targetY - avatar.previousY) * t;
		const visualZ = avatar.previousZ + (avatar.targetZ - avatar.previousZ) * t;

		const local = tileToLocal(visualX, visualY, visualZ);
		const offsetX =
			avatar.direction >= 4 && avatar.direction <= 6
				? AVATAR_SPRITE_OFFSET_X
				: 0;
		avatar.sprite.setPosition(
			Math.round(local.x + offsetX),
			Math.round(local.y + AVATAR_SPRITE_OFFSET_Y)
		);

		if (avatar.shadow) {
			avatar.shadow.setPosition(local.x, local.y);
		}

		const sortX = Math.round(visualX);
		const sortY = Math.round(visualY);
		avatar.sprite.setDepth(
			calculateZIndex(sortX, sortY, avatar.z, PRIORITY_PLAYER)
		);
		if (avatar.shadow) {
			avatar.shadow.setDepth(
				calculateZIndex(sortX, sortY, 0, PRIORITY_PLAYER_SHADOW)
			);
		}
	}

	private updateAutonomy(avatar: RoomAvatarState, deltaMs: number): void {
		if (!avatar.autonomy || !this.currentModel) return;

		if (avatar.action === "waving") {
			avatar.waveTimer -= deltaMs;
			if (avatar.waveTimer <= 0) {
				avatar.action = "idle";
				avatar.idleTimer = randomBetween(IDLE_MIN_MS, IDLE_MAX_MS);
			}
			return;
		}

		if (avatar.action !== "idle") return;

		avatar.idleTimer -= deltaMs;
		if (avatar.idleTimer > 0) return;

		const roll = Math.random();

		if (roll < 0.15) {
			avatar.action = "waving";
			avatar.waveTimer = 1500;
			return;
		}
		if (roll < 0.3) {
			avatar.direction = Math.floor(Math.random() * 8) as Direction;
			avatar.idleTimer = randomBetween(IDLE_MIN_MS, IDLE_MAX_MS);
			this.updateAvatarTexture(avatar);
			return;
		}

		const tiles = this.currentModel.getValidTiles();
		if (tiles.length === 0) return;

		for (let attempt = 0; attempt < 10; attempt++) {
			const target = tiles[Math.floor(Math.random() * tiles.length)]!;
			if (target.x === avatar.x && target.y === avatar.y) continue;

			const path = this.currentModel.findPath(
				avatar.x,
				avatar.y,
				target.x,
				target.y
			);
			if (path && path.length > 0 && path.length <= 12) {
				avatar.path = path;
				avatar.action = "walking";
				this.beginNextWalkStep(avatar);
				return;
			}
		}

		avatar.idleTimer = randomBetween(IDLE_MIN_MS, IDLE_MAX_MS);
	}
}
