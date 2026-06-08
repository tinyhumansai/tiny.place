import {
	Application,
	Container,
	type Renderer,
	Sprite,
	Texture,
	Point,
	Assets,
} from "pixi.js";
import type RoomModel from "./RoomModel";
import RoomImager from "./imagers/RoomImager";
import AvatarImager from "./imagers/AvatarImager";
import FurniImager, {
	type LoadedFurniture,
	type RoomItemDescription,
} from "./imagers/FurniImager";
import AvatarInfo, { type Direction } from "./imagers/AvatarInfo";
import {
	ROOM_TILE_HEIGHT,
	ROOM_TILE_WIDTH,
	ROOM_WALL_L_OFFSET_X,
	ROOM_WALL_L_OFFSET_Y,
	ROOM_WALL_R_OFFSET_X,
	ROOM_WALL_R_OFFSET_Y,
	SELECTED_TILE_ASSET,
	SHADOW_TILE_ASSET,
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
const ROOM_USER_SPRITE_OFFSET_X = 3;
const ROOM_USER_SPRITE_OFFSET_Y = -85;

type AvatarAction = "idle" | "walking" | "waving" | "sitting";

type FurniDirection = 0 | 2 | 4 | 6;

const FURNI_DRAW_OFFSET_X = 32;
const FURNI_DRAW_OFFSET_Y = 16;
const FURNI_FRAME_SPEED = 500;

const SITTABLE_ITEMS = [
	18, 26, 30, 34, 36, 38, 39, 55,
];

const DECORATIVE_ITEMS = [
	13, 25, 40, 47, 54, 57,
];

const TABLE_ITEMS = [
	17, 20, 21, 22, 23,
];

const ALL_PLACEABLE_ITEMS = [
	...SITTABLE_ITEMS,
	...DECORATIVE_ITEMS,
	...TABLE_ITEMS,
];

export interface RoomFurniture {
	id: number;
	itemId: number;
	x: number;
	y: number;
	z: number;
	direction: FurniDirection;
	state: number;
	frame: number;
	frameCounter: number;
	sprite: Sprite;
	loaded: boolean;
	furniData: LoadedFurniture | null;
	itemDescription: RoomItemDescription | null;
	occupiedTiles: Array<{ x: number; y: number }>;
}

function randomBetween(min: number, max: number): number {
	return min + Math.random() * (max - min);
}

export interface RoomAvatar {
	id: number;
	name: string;
	figure: string;
	x: number;
	y: number;
	z: number;
	direction: Direction;
	container: Container;
	bodySprite: Sprite;
	headSprite: Sprite;
	shadowSprite: Sprite;
	bodyTextures: Record<string, Texture>;
	headTextures: Record<string, Texture>;
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
	sitTimer: number;
	sittingOnFurni: number | null;
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

function tileToLocal(x: number, y: number, z: number): Point {
	return new Point(
		(x - y) * ROOM_TILE_WIDTH,
		(x + y) * ROOM_TILE_HEIGHT - z * ROOM_TILE_HEIGHT * 2
	);
}

export default class GameEngine {
	public app: Application;
	public roomContainer: Container;
	public roomImager: RoomImager;
	public avatarImager: AvatarImager;
	public furniImager: FurniImager;
	public currentModel: RoomModel | null;
	public avatars: Map<number, RoomAvatar>;
	public furniture: Map<number, RoomFurniture>;
	public selectedTileTexture: Texture | null;
	public shadowTileTexture: Texture | null;
	public selectedTileSprite: Sprite | null;
	public isMouseDragging: boolean;
	public lastMouseX: number;
	public lastMouseY: number;
	public maxHeight: number;
	private _destroyed: boolean;

	public constructor() {
		this.app = new Application({
			antialias: false,
			backgroundAlpha: 0,
			resolution: 1,
			resizeTo: undefined,
		});
		(this.app.renderer as Renderer).background.color = 0x1a1a2e;

		this.roomContainer = new Container();
		this.roomContainer.sortableChildren = true;
		this.app.stage.addChild(this.roomContainer);

		this.roomImager = new RoomImager();
		this.avatarImager = new AvatarImager();
		this.furniImager = new FurniImager();
		this.currentModel = null;
		this.avatars = new Map();
		this.furniture = new Map();
		this.selectedTileTexture = null;
		this.shadowTileTexture = null;
		this.selectedTileSprite = null;
		this.isMouseDragging = false;
		this.lastMouseX = 0;
		this.lastMouseY = 0;
		this.maxHeight = 1;
		this._destroyed = false;

		this.app.ticker.add((delta) => {
			this.gameLoop(delta);
		});
	}

	public async initialize(): Promise<void> {
		await Promise.all([
			this.avatarImager.initialize(),
			this.furniImager.initialize(),
		]);

		this.roomImager.initialize();

		try {
			this.selectedTileTexture = await Assets.load(SELECTED_TILE_ASSET);
		} catch {
			this.selectedTileTexture = null;
		}
		try {
			this.shadowTileTexture = await Assets.load(SHADOW_TILE_ASSET);
		} catch {
			this.shadowTileTexture = null;
		}
	}

	public mount(container: HTMLElement): void {
		container.appendChild(this.app.view as unknown as HTMLElement);
		this.resize(container.clientWidth, container.clientHeight);
		this.setupInteractions();
	}

	public resize(width: number, height: number): void {
		this.app.renderer.resize(width, height);
		this.centerCamera();
	}

	public setupInteractions(): void {
		const view = this.app.view as unknown as HTMLElement;

		view.addEventListener("mousedown", () => {
			this.isMouseDragging = true;
		});
		view.addEventListener("mouseup", () => {
			this.isMouseDragging = false;
		});
		view.addEventListener("mousemove", (event: MouseEvent) => {
			if (this.isMouseDragging) {
				const diffX = Math.round(this.lastMouseX - event.clientX);
				const diffY = Math.round(this.lastMouseY - event.clientY);
				this.roomContainer.x -= diffX;
				this.roomContainer.y -= diffY;
			}
			this.lastMouseX = Math.round(event.clientX);
			this.lastMouseY = Math.round(event.clientY);
		});

		view.addEventListener("touchstart", (event: TouchEvent) => {
			const firstTouch = event.touches[0];
			if (event.touches.length === 1 && firstTouch) {
				this.lastMouseX = firstTouch.clientX;
				this.lastMouseY = firstTouch.clientY;
				this.isMouseDragging = true;
			}
		});
		view.addEventListener("touchmove", (event: TouchEvent) => {
			event.preventDefault();
			const firstTouch = event.touches[0];
			if (event.touches.length === 1 && this.isMouseDragging && firstTouch) {
				const diffX = Math.round(this.lastMouseX - firstTouch.clientX);
				const diffY = Math.round(this.lastMouseY - firstTouch.clientY);
				this.roomContainer.x -= diffX;
				this.roomContainer.y -= diffY;
				this.lastMouseX = firstTouch.clientX;
				this.lastMouseY = firstTouch.clientY;
			}
		});
		view.addEventListener("touchend", () => {
			this.isMouseDragging = false;
		});
	}

	public centerCamera(): void {
		if (this.currentModel == null) return;
		const model = this.currentModel;
		const doorCoords = tileToLocal(model.doorX, model.doorY, 0);
		const width = this.app.renderer.width;
		const height = this.app.renderer.height;

		this.roomContainer.x = Math.round((width - doorCoords.x) / 2);
		this.roomContainer.y = Math.round(
			(height - (doorCoords.y + CAMERA_CENTERED_OFFSET_Y)) / 2
		);
	}

	public loadRoom(model: RoomModel): void {
		this.clearRoom();
		this.currentModel = model;

		let maxHeight = 1;
		for (let index = 0; index < model.maxX; index++) {
			for (let index_ = 0; index_ < model.maxY; index_++) {
				const tile = model.getTile(index, index_);
				if (tile > maxHeight) maxHeight = tile;
			}
		}
		this.maxHeight = maxHeight;

		this.renderWalls(model, maxHeight);
		this.renderFloor(model);
		this.centerCamera();
	}

	public clearRoom(): void {
		this.roomContainer.removeChildren();
		this.avatars.clear();
		this.furniture.clear();
		this.currentModel = null;
	}

	public renderWalls(model: RoomModel, maxHeight: number): void {
		let minY = model.maxX;

		for (let index = 0; index < model.maxX; index++) {
			for (let index_ = 0; index_ < model.maxY; index_++) {
				const tile = model.getTile(index, index_);
				if (
					(model.doorX !== index || model.doorY !== index_) &&
					tile > 0 &&
					index_ <= minY
				) {
					if (minY > index_) minY = index_;
					const wallTexture = this.roomImager.generateRoomWallR(
						maxHeight - tile
					);
					const wallSprite = new Sprite(wallTexture);
					const localPosition = tileToLocal(index, index_ + 1, maxHeight - 1);
					wallSprite.x = localPosition.x + ROOM_WALL_R_OFFSET_X;
					wallSprite.y = localPosition.y + ROOM_WALL_R_OFFSET_Y + 4;
					wallSprite.zIndex = calculateZIndex(
						index,
						index_ + 1,
						0,
						PRIORITY_WALL
					);
					this.roomContainer.addChild(wallSprite);
				}
			}
		}

		for (let index = 0; index < model.maxY; index++) {
			for (let index_ = 0; index_ < model.maxX; index_++) {
				const tile = model.getTile(index_, index);
				if ((model.doorX !== index_ || model.doorY !== index) && tile > 0) {
					let wallTexture: Texture;
					if (index === model.doorY) {
						wallTexture = this.roomImager.generateRoomDoorL();
					} else if (index === model.doorY - 1) {
						wallTexture = this.roomImager.generateRoomDoorBeforeL(
							maxHeight - tile
						);
					} else {
						wallTexture = this.roomImager.generateRoomWallL(maxHeight - tile);
					}
					const wallSprite = new Sprite(wallTexture);
					const localPosition = tileToLocal(index_, index, maxHeight - 1);
					wallSprite.x = localPosition.x + ROOM_WALL_L_OFFSET_X;
					wallSprite.y = localPosition.y + ROOM_WALL_L_OFFSET_Y + 4;
					wallSprite.zIndex = calculateZIndex(index_, index, 0, PRIORITY_WALL);
					this.roomContainer.addChild(wallSprite);
					break;
				}
			}
		}
	}

	public renderFloor(model: RoomModel): void {
		const { roomTileTexture, roomStairLTexture, roomStairRTexture } =
			this.roomImager;
		if (!roomTileTexture) return;

		for (let index = 0; index < model.maxX; index++) {
			for (let index_ = 0; index_ < model.maxY; index_++) {
				const tile = model.getTile(index, index_);
				if (tile > 0) {
					let texture = roomTileTexture;

					if (
						model.isValidTile(index + 1, index_) &&
						model.getTile(index + 1, index_) < tile
					) {
						if (roomStairLTexture) texture = roomStairLTexture;
					} else if (
						model.isValidTile(index - 1, index_) &&
						model.getTile(index - 1, index_) > tile
					) {
						continue;
					} else if (
						model.isValidTile(index, index_ - 1) &&
						model.getTile(index, index_ - 1) > tile
					) {
						continue;
					} else if (
						model.isValidTile(index, index_ + 1) &&
						model.getTile(index, index_ + 1) < tile
					) {
						if (roomStairRTexture) {
							texture = roomStairRTexture;
							const floorSprite = new Sprite(texture);
							const localPosition = tileToLocal(index, index_, tile - 1);
							floorSprite.x = localPosition.x - 34;
							floorSprite.y = localPosition.y;
							floorSprite.zIndex = calculateZIndex(
								index,
								index_,
								0,
								model.doorX === index && model.doorY === index_
									? PRIORITY_DOOR_FLOOR
									: PRIORITY_FLOOR
							);
							this.roomContainer.addChild(floorSprite);
							continue;
						}
					}

					const floorSprite = new Sprite(texture);
					const localPosition = tileToLocal(index, index_, tile - 1);
					floorSprite.x = localPosition.x;
					floorSprite.y = localPosition.y;
					floorSprite.zIndex = calculateZIndex(
						index,
						index_,
						0,
						model.doorX === index && model.doorY === index_
							? PRIORITY_DOOR_FLOOR
							: PRIORITY_FLOOR
					);
					this.roomContainer.addChild(floorSprite);
				}
			}
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
		if (this.currentModel == null) return;

		const container = new Container();
		const bodySprite = new Sprite();
		const headSprite = new Sprite();
		const shadowSprite = this.shadowTileTexture
			? new Sprite(this.shadowTileTexture)
			: new Sprite();

		container.addChild(bodySprite);
		container.addChild(headSprite);

		const tileZ = this.currentModel.isValidTile(x, y)
			? this.currentModel.getTile(x, y) - 1
			: 0;
		const effectiveZ = z + tileZ;

		const avatar: RoomAvatar = {
			id,
			name,
			figure,
			x,
			y,
			z: effectiveZ,
			direction,
			container,
			bodySprite,
			headSprite,
			shadowSprite,
			bodyTextures: {},
			headTextures: {},
			loaded: false,
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
			sitTimer: 0,
			sittingOnFurni: null,
			autonomy: false,
		};

		this.avatars.set(id, avatar);

		this.roomContainer.addChild(shadowSprite);
		this.roomContainer.addChild(container);

		this.updateAvatarSpritePosition(avatar);

		await this.loadAvatarTextures(avatar);
		if (this._destroyed) return;
		avatar.loaded = true;
		this.updateAvatarTexture(avatar);
	}

	public async loadAvatarTextures(avatar: RoomAvatar): Promise<void> {
		const directions: Array<Direction> = [0, 1, 2, 3, 4, 5, 6, 7];
		const promises: Array<Promise<void>> = [];

		for (const direction of directions) {
			promises.push(this.loadBodyTexture(avatar, direction, ["std"], 0));
			promises.push(this.loadHeadTexture(avatar, direction, "std", 0));
			promises.push(this.loadHeadTexture(avatar, direction, "eyb", 0));
			for (let index = 0; index <= 3; index++) {
				promises.push(this.loadBodyTexture(avatar, direction, ["wlk"], index));
			}
			for (let index = 0; index <= 1; index++) {
				promises.push(this.loadBodyTexture(avatar, direction, ["wav"], index));
				promises.push(this.loadHeadTexture(avatar, direction, "spk", index));
			}
		}

		for (let index = 0; index <= 7; index += 2) {
			promises.push(
				this.loadBodyTexture(avatar, index as Direction, ["sit"], 0)
			);
		}

		await Promise.all(promises);
	}

	public async loadBodyTexture(
		avatar: RoomAvatar,
		direction: Direction,
		action: Array<string>,
		frame: number
	): Promise<void> {
		const info = new AvatarInfo(
			avatar.figure,
			direction,
			direction,
			action,
			"std",
			frame,
			false,
			true,
			"n"
		);
		const { bodyTextures } = avatar;
		const image = await this.avatarImager.generateGeneric(info, false);
		const key = `${direction}_${action.join("-")}_${frame}`;
		bodyTextures[key] = Texture.from(image);
	}

	public async loadHeadTexture(
		avatar: RoomAvatar,
		direction: Direction,
		gesture: string,
		frame: number
	): Promise<void> {
		const info = new AvatarInfo(
			avatar.figure,
			direction,
			direction,
			["std"],
			gesture,
			frame,
			true,
			false,
			"n"
		);
		const { headTextures } = avatar;
		const image = await this.avatarImager.generateGeneric(info, false);
		const key = `${direction}_${gesture}_${frame}`;
		headTextures[key] = Texture.from(image);
	}

	public updateAvatarTexture(avatar: RoomAvatar): void {
		if (!avatar.loaded) return;

		let bodyKey: string;
		let headGesture: string;
		let headFrame = 0;

		if (avatar.action === "sitting") {
			const sitDirection = this._nearestEvenDirection(avatar.direction);
			bodyKey = `${sitDirection}_sit_0`;
			headGesture = avatar.frame % 40 < 2 ? "eyb" : "std";
		} else if (avatar.action === "walking") {
			const walkFrame = avatar.frame % 4;
			bodyKey = `${avatar.direction}_wlk_${walkFrame}`;
			headGesture = "std";
		} else if (avatar.action === "waving") {
			const waveFrame = avatar.frame % 2;
			bodyKey = `${avatar.direction}_wav_${waveFrame}`;
			headGesture = "spk";
			headFrame = avatar.frame % 2;
		} else {
			bodyKey = `${avatar.direction}_std_0`;
			headGesture = avatar.frame % 40 < 2 ? "eyb" : "std";
		}

		const headKey = `${avatar.direction}_${headGesture}_${headFrame}`;
		const headFallback = `${avatar.direction}_std_0`;

		if (avatar.bodyTextures[bodyKey]) {
			avatar.bodySprite.texture = avatar.bodyTextures[bodyKey];
		}
		if (avatar.headTextures[headKey]) {
			avatar.headSprite.texture = avatar.headTextures[headKey];
		} else if (avatar.headTextures[headFallback]) {
			avatar.headSprite.texture = avatar.headTextures[headFallback];
		}
	}

	public updateAvatarSpritePosition(avatar: RoomAvatar): void {
		const localPosition = tileToLocal(avatar.x, avatar.y, avatar.z);
		const offsetX =
			avatar.direction === 6 || avatar.direction === 5 || avatar.direction === 4
				? ROOM_USER_SPRITE_OFFSET_X
				: 0;
		avatar.container.x = Math.round(localPosition.x + offsetX);
		avatar.container.y = Math.round(
			localPosition.y + ROOM_USER_SPRITE_OFFSET_Y
		);

		const shadowCoords = tileToLocal(avatar.x, avatar.y, avatar.z);
		avatar.shadowSprite.x = shadowCoords.x;
		avatar.shadowSprite.y = shadowCoords.y;

		avatar.shadowSprite.zIndex = calculateZIndex(
			avatar.x,
			avatar.y,
			0,
			PRIORITY_PLAYER_SHADOW
		);
		avatar.container.zIndex = calculateZIndex(
			avatar.x,
			avatar.y,
			avatar.z,
			PRIORITY_PLAYER
		);
	}

	public removeAvatar(id: number): void {
		const avatar = this.avatars.get(id);
		if (avatar) {
			this.roomContainer.removeChild(avatar.container);
			this.roomContainer.removeChild(avatar.shadowSprite);
			this.avatars.delete(id);
		}
	}

	public moveAvatar(
		id: number,
		x: number,
		y: number,
		direction: Direction
	): void {
		const avatar = this.avatars.get(id);
		if (avatar && this.currentModel) {
			avatar.x = x;
			avatar.y = y;
			avatar.direction = direction;
			if (this.currentModel.isValidTile(x, y)) {
				avatar.z = this.currentModel.getTile(x, y) - 1;
			}
			this.updateAvatarSpritePosition(avatar);
			this.updateAvatarTexture(avatar);
		}
	}

	public setAvatarDirection(id: number, direction: Direction): void {
		const avatar = this.avatars.get(id);
		if (avatar) {
			avatar.direction = direction;
			this.updateAvatarSpritePosition(avatar);
			this.updateAvatarTexture(avatar);
		}
	}

	public enableAutonomy(id: number): void {
		const avatar = this.avatars.get(id);
		if (avatar) {
			avatar.autonomy = true;
			avatar.idleTimer = randomBetween(IDLE_MIN_MS, IDLE_MAX_MS);
		}
	}

	public disableAutonomy(id: number): void {
		const avatar = this.avatars.get(id);
		if (avatar) {
			avatar.autonomy = false;
			avatar.action = "idle";
			avatar.path = [];
		}
	}

	private directionFromDelta(dx: number, dy: number): Direction {
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

	private beginNextWalkStep(avatar: RoomAvatar): void {
		if (avatar.path.length === 0) {
			if (avatar.sittingOnFurni !== null) {
				const furni = this.furniture.get(avatar.sittingOnFurni);
				if (furni) {
					avatar.action = "sitting";
					avatar.direction = this._nearestEvenDirection(
						this.directionTowardFurni(avatar.x, avatar.y, furni.x, furni.y)
					);
					avatar.sitTimer = randomBetween(3000, 8000);
					this.updateAvatarSpritePosition(avatar);
					this.updateAvatarTexture(avatar);
					return;
				}
				avatar.sittingOnFurni = null;
			}
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
		avatar.direction = this.directionFromDelta(dx, dy);
	}

	private updateWalking(avatar: RoomAvatar, deltaMs: number): void {
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

		const localPosition = tileToLocal(visualX, visualY, visualZ);
		const offsetX =
			avatar.direction === 6 || avatar.direction === 5 || avatar.direction === 4
				? ROOM_USER_SPRITE_OFFSET_X
				: 0;
		avatar.container.x = Math.round(localPosition.x + offsetX);
		avatar.container.y = Math.round(
			localPosition.y + ROOM_USER_SPRITE_OFFSET_Y
		);

		avatar.shadowSprite.x = localPosition.x;
		avatar.shadowSprite.y = localPosition.y;

		const sortX = Math.round(visualX);
		const sortY = Math.round(visualY);
		avatar.shadowSprite.zIndex = calculateZIndex(sortX, sortY, 0, PRIORITY_PLAYER_SHADOW);
		avatar.container.zIndex = calculateZIndex(sortX, sortY, avatar.z, PRIORITY_PLAYER);
	}

	private _nearestEvenDirection(direction: Direction): Direction {
		return (Math.round(direction / 2) * 2) % 8 as Direction;
	}

	public async addFurniture(
		id: number,
		itemId: number,
		x: number,
		y: number,
		direction: FurniDirection
	): Promise<void> {
		if (!this.currentModel) return;

		const tileHeight = this.currentModel.isValidTile(x, y)
			? this.currentModel.getTile(x, y) - 1
			: 0;

		const sprite = new Sprite();
		const furni: RoomFurniture = {
			id,
			itemId,
			x,
			y,
			z: tileHeight,
			direction,
			state: 0,
			frame: 0,
			frameCounter: 0,
			sprite,
			loaded: false,
			furniData: null,
			itemDescription: null,
			occupiedTiles: [],
		};

		this.furniture.set(id, furni);
		this.roomContainer.addChild(sprite);
		this.updateFurniSpritePosition(furni);

		try {
			const loadedFurni = await this.furniImager.loadFurniture(itemId);
			if (this._destroyed) return;
			furni.furniData = loadedFurni;
			furni.itemDescription = loadedFurni.itemData;
			furni.loaded = true;
			furni.occupiedTiles = this._calculateOccupiedTiles(furni);
			this.updateFurniTexture(furni);
			this.updateFurniSpritePosition(furni);
		} catch (error) {
			console.warn(`Failed to load furniture ${itemId}:`, error);
		}
	}

	private _calculateOccupiedTiles(
		furni: RoomFurniture
	): Array<{ x: number; y: number }> {
		const tiles: Array<{ x: number; y: number }> = [];
		if (!furni.itemDescription) return [{ x: furni.x, y: furni.y }];

		const description = furni.itemDescription;
		const xDim =
			furni.direction === 2 || furni.direction === 6
				? description.ydim
				: description.xdim;
		const yDim =
			furni.direction === 2 || furni.direction === 6
				? description.xdim
				: description.ydim;

		for (let dx = 0; dx < xDim; dx++) {
			for (let dy = 0; dy < yDim; dy++) {
				tiles.push({ x: furni.x + dx, y: furni.y + dy });
			}
		}
		return tiles;
	}

	public isTileOccupiedByFurni(
		x: number,
		y: number
	): RoomFurniture | null {
		for (const furni of this.furniture.values()) {
			for (const tile of furni.occupiedTiles) {
				if (tile.x === x && tile.y === y) return furni;
			}
		}
		return null;
	}

	private updateFurniTexture(furni: RoomFurniture): void {
		if (!furni.loaded || !furni.furniData) return;

		const direction = furni.furniData.directions.includes(furni.direction)
			? furni.direction
			: furni.furniData.directions[0] ?? 0;

		const textureKey = `${direction}_${furni.state}_${furni.frame}`;
		const fallbackKey = `${direction}_0_0`;
		const furniTexture =
			furni.furniData.textures[textureKey] ??
			furni.furniData.textures[fallbackKey];

		if (furniTexture) {
			furni.sprite.texture = Texture.from(furniTexture.canvas);
		}
	}

	private updateFurniSpritePosition(furni: RoomFurniture): void {
		const localPosition = tileToLocal(furni.x, furni.y, furni.z);
		furni.sprite.x = localPosition.x + FURNI_DRAW_OFFSET_X;
		furni.sprite.y = localPosition.y + FURNI_DRAW_OFFSET_Y;

		if (furni.loaded && furni.furniData) {
			const direction = furni.furniData.directions.includes(furni.direction)
				? furni.direction
				: furni.furniData.directions[0] ?? 0;
			const textureKey = `${direction}_${furni.state}_${furni.frame}`;
			const fallbackKey = `${direction}_0_0`;
			const furniTexture =
				furni.furniData.textures[textureKey] ??
				furni.furniData.textures[fallbackKey];

			if (furniTexture) {
				furni.sprite.x = localPosition.x + FURNI_DRAW_OFFSET_X + furniTexture.offsetX;
				furni.sprite.y = localPosition.y + FURNI_DRAW_OFFSET_Y + furniTexture.offsetY;
			}
		}

		furni.sprite.zIndex = calculateZIndex(
			furni.x,
			furni.y,
			furni.z,
			PRIORITY_ROOM_ITEM
		);
	}

	public removeFurniture(id: number): void {
		const furni = this.furniture.get(id);
		if (furni) {
			this.roomContainer.removeChild(furni.sprite);
			this.furniture.delete(id);
		}
	}

	public placeRandomFurniture(count: number): void {
		if (!this.currentModel) return;

		const validTiles = this.currentModel.getValidTiles();
		const placed: Set<string> = new Set();
		let furniId = 1000;

		for (
			let index = 0;
			index < count && placed.size < validTiles.length;
			index++
		) {
			const itemId =
				ALL_PLACEABLE_ITEMS[
					Math.floor(Math.random() * ALL_PLACEABLE_ITEMS.length)
				]!;

			for (let attempt = 0; attempt < 20; attempt++) {
				const tile =
					validTiles[Math.floor(Math.random() * validTiles.length)]!;
				const key = `${tile.x},${tile.y}`;

				if (placed.has(key)) continue;
				if (
					tile.x === this.currentModel.doorX &&
					tile.y === this.currentModel.doorY
				)
					continue;

				const directions: Array<FurniDirection> = [0, 2, 4, 6];
				const direction =
					directions[Math.floor(Math.random() * directions.length)]!;

				placed.add(key);
				void this.addFurniture(furniId++, itemId, tile.x, tile.y, direction);
				break;
			}
		}
	}

	private findSittableFurniture(): Array<RoomFurniture> {
		const sittable: Array<RoomFurniture> = [];
		for (const furni of this.furniture.values()) {
			if (
				furni.loaded &&
				furni.itemDescription &&
				furni.itemDescription.cansiton === 1
			) {
				sittable.push(furni);
			}
		}
		return sittable;
	}

	private isFurniOccupiedByAvatar(furni: RoomFurniture): boolean {
		for (const avatar of this.avatars.values()) {
			if (avatar.sittingOnFurni === furni.id) return true;
		}
		return false;
	}

	private directionTowardFurni(
		avatarX: number,
		avatarY: number,
		furniX: number,
		furniY: number
	): Direction {
		const dx = Math.sign(furniX - avatarX);
		const dy = Math.sign(furniY - avatarY);
		return this.directionFromDelta(dx, dy);
	}

	private updateAutonomy(avatar: RoomAvatar, deltaMs: number): void {
		if (!avatar.autonomy || !this.currentModel) return;

		if (avatar.action === "sitting") {
			avatar.sitTimer -= deltaMs;
			if (avatar.sitTimer <= 0) {
				avatar.action = "idle";
				avatar.sittingOnFurni = null;
				avatar.idleTimer = randomBetween(IDLE_MIN_MS, IDLE_MAX_MS);
			}
			return;
		}

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

		if (roll < 0.3) {
			const sittable = this.findSittableFurniture();
			const available = sittable.filter(
				(f) => !this.isFurniOccupiedByAvatar(f)
			);
			if (available.length > 0) {
				const target =
					available[Math.floor(Math.random() * available.length)]!;
				const sitTile = target.occupiedTiles[0] ?? {
					x: target.x,
					y: target.y,
				};
				const path = this.currentModel.findPath(
					avatar.x,
					avatar.y,
					sitTile.x,
					sitTile.y
				);
				if (path && path.length > 0 && path.length <= 15) {
					avatar.path = path;
					avatar.action = "walking";
					avatar.sittingOnFurni = target.id;
					this.beginNextWalkStep(avatar);
					return;
				}
			}
		}

		if (roll < 0.4) {
			avatar.action = "waving";
			avatar.waveTimer = 1500;
			return;
		}
		if (roll < 0.5) {
			const newDirection = Math.floor(Math.random() * 8) as Direction;
			avatar.direction = newDirection;
			avatar.idleTimer = randomBetween(IDLE_MIN_MS, IDLE_MAX_MS);
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

	public gameLoop = (delta: number): void => {
		if (this._destroyed) return;
		const deltaMs = delta * (1 / 60) * 1000;

		for (const furni of this.furniture.values()) {
			if (!furni.loaded || !furni.furniData) continue;
			if (furni.furniData.stateCount <= 1) continue;
			furni.frameCounter += deltaMs;
			if (furni.frameCounter >= FURNI_FRAME_SPEED) {
				furni.frame++;
				furni.frameCounter = 0;
				this.updateFurniTexture(furni);
			}
		}

		for (const avatar of this.avatars.values()) {
			avatar.frameCounter += deltaMs;
			if (avatar.frameCounter >= FRAME_SPEED) {
				avatar.frame++;
				avatar.frameCounter = 0;
				this.updateAvatarTexture(avatar);
			}

			if (avatar.action === "walking") {
				this.updateWalking(avatar, deltaMs);
			}

			this.updateAutonomy(avatar, deltaMs);
		}
	};

	public destroy(): void {
		this._destroyed = true;
		this.app.destroy(true, { children: true, texture: true });
	}
}
