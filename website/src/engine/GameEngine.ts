// @ts-nocheck — ported from bobba_client engine (TS 3.6), strict index checks deferred
/* eslint-disable */
import {
	Application,
	Container,
	Sprite,
	Texture,
	Point,
	Assets,
} from "pixi.js";
import RoomModel from "./RoomModel";
import RoomImager from "./imagers/RoomImager";
import AvatarImager from "./imagers/AvatarImager";
import AvatarInfo from "./imagers/AvatarInfo";
import type { Direction } from "./imagers/AvatarInfo";
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
	PRIORITY_MULTIPLIER,
	COMPARABLE_X_Y,
	COMPARABLE_Z,
} from "./constants";

const CAMERA_CENTERED_OFFSET_Y = 150;
const FRAME_SPEED = 100;
const ROOM_USER_SPRITE_OFFSET_X = 3;
const ROOM_USER_SPRITE_OFFSET_Y = -85;

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
}

function calculateZIndex(
	x: number,
	y: number,
	z: number,
	priority: number,
): number {
	return (
		(x + y) * COMPARABLE_X_Y +
		z * COMPARABLE_Z +
		PRIORITY_MULTIPLIER * priority
	);
}

function tileToLocal(x: number, y: number, z: number): Point {
	return new Point(
		(x - y) * ROOM_TILE_WIDTH,
		(x + y) * ROOM_TILE_HEIGHT - z * ROOM_TILE_HEIGHT * 2,
	);
}

export default class GameEngine {
	app: Application;
	roomContainer: Container;
	roomImager: RoomImager;
	avatarImager: AvatarImager;
	currentModel: RoomModel | null;
	avatars: Map<number, RoomAvatar>;
	selectedTileTexture: Texture | null;
	shadowTileTexture: Texture | null;
	selectedTileSprite: Sprite | null;
	isMouseDragging: boolean;
	lastMouseX: number;
	lastMouseY: number;
	maxHeight: number;
	private _destroyed: boolean;

	constructor() {
		this.app = new Application({
			antialias: false,
			backgroundAlpha: 0,
			resolution: 1,
			resizeTo: undefined,
		});
		(this.app.renderer as any).background.color = 0x1a1a2e;

		this.roomContainer = new Container();
		this.roomContainer.sortableChildren = true;
		this.app.stage.addChild(this.roomContainer);

		this.roomImager = new RoomImager();
		this.avatarImager = new AvatarImager();
		this.currentModel = null;
		this.avatars = new Map();
		this.selectedTileTexture = null;
		this.shadowTileTexture = null;
		this.selectedTileSprite = null;
		this.isMouseDragging = false;
		this.lastMouseX = 0;
		this.lastMouseY = 0;
		this.maxHeight = 1;
		this._destroyed = false;

		this.app.ticker.add((delta) => this.gameLoop(delta));
	}

	async initialize(): Promise<void> {
		await this.avatarImager.initialize();

		this.roomImager.initialize();

		try {
			this.selectedTileTexture = await Assets.load(
				SELECTED_TILE_ASSET,
			);
		} catch {
			this.selectedTileTexture = null;
		}
		try {
			this.shadowTileTexture = await Assets.load(SHADOW_TILE_ASSET);
		} catch {
			this.shadowTileTexture = null;
		}
	}

	mount(container: HTMLElement): void {
		container.appendChild(this.app.view as unknown as HTMLElement);
		this.resize(container.clientWidth, container.clientHeight);
		this.setupInteractions();
	}

	resize(width: number, height: number): void {
		this.app.renderer.resize(width, height);
		this.centerCamera();
	}

	setupInteractions(): void {
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
			if (event.touches.length === 1) {
				this.lastMouseX = event.touches[0].clientX;
				this.lastMouseY = event.touches[0].clientY;
				this.isMouseDragging = true;
			}
		});
		view.addEventListener("touchmove", (event: TouchEvent) => {
			event.preventDefault();
			if (event.touches.length === 1 && this.isMouseDragging) {
				const diffX = Math.round(
					this.lastMouseX - event.touches[0].clientX,
				);
				const diffY = Math.round(
					this.lastMouseY - event.touches[0].clientY,
				);
				this.roomContainer.x -= diffX;
				this.roomContainer.y -= diffY;
				this.lastMouseX = event.touches[0].clientX;
				this.lastMouseY = event.touches[0].clientY;
			}
		});
		view.addEventListener("touchend", () => {
			this.isMouseDragging = false;
		});
	}

	centerCamera(): void {
		if (this.currentModel == null) return;
		const model = this.currentModel;
		const doorCoords = tileToLocal(model.doorX, model.doorY, 0);
		const width = this.app.renderer.width;
		const height = this.app.renderer.height;

		this.roomContainer.x = Math.round(
			(width - doorCoords.x) / 2,
		);
		this.roomContainer.y = Math.round(
			(height - (doorCoords.y + CAMERA_CENTERED_OFFSET_Y)) / 2,
		);
	}

	loadRoom(model: RoomModel): void {
		this.clearRoom();
		this.currentModel = model;

		let maxHeight = 1;
		for (let i = 0; i < model.maxX; i++) {
			for (let j = 0; j < model.maxY; j++) {
				const tile = model.getTile(i, j);
				if (tile > maxHeight) maxHeight = tile;
			}
		}
		this.maxHeight = maxHeight;

		this.renderWalls(model, maxHeight);
		this.renderFloor(model);
		this.centerCamera();
	}

	clearRoom(): void {
		this.roomContainer.removeChildren();
		this.avatars.clear();
		this.currentModel = null;
	}

	renderWalls(model: RoomModel, maxHeight: number): void {
		let minY = model.maxX;

		for (let i = 0; i < model.maxX; i++) {
			for (let j = 0; j < model.maxY; j++) {
				const tile = model.getTile(i, j);
				if (
					(model.doorX !== i || model.doorY !== j) &&
					tile > 0 &&
					j <= minY
				) {
					if (minY > j) minY = j;
					const wallTexture = this.roomImager.generateRoomWallR(
						maxHeight - tile,
					);
					const wallSprite = new Sprite(wallTexture);
					const localPosition = tileToLocal(
						i,
						j + 1,
						maxHeight - 1,
					);
					wallSprite.x =
						localPosition.x + ROOM_WALL_R_OFFSET_X;
					wallSprite.y =
						localPosition.y + ROOM_WALL_R_OFFSET_Y + 4;
					wallSprite.zIndex = calculateZIndex(
						i,
						j + 1,
						0,
						PRIORITY_WALL,
					);
					this.roomContainer.addChild(wallSprite);
				}
			}
		}

		for (let j = 0; j < model.maxY; j++) {
			for (let i = 0; i < model.maxX; i++) {
				const tile = model.getTile(i, j);
				if (
					(model.doorX !== i || model.doorY !== j) &&
					tile > 0
				) {
					let wallTexture: Texture;
					if (j === model.doorY) {
						wallTexture =
							this.roomImager.generateRoomDoorL();
					} else if (j === model.doorY - 1) {
						wallTexture =
							this.roomImager.generateRoomDoorBeforeL(
								maxHeight - tile,
							);
					} else {
						wallTexture =
							this.roomImager.generateRoomWallL(
								maxHeight - tile,
							);
					}
					const wallSprite = new Sprite(wallTexture);
					const localPosition = tileToLocal(
						i,
						j,
						maxHeight - 1,
					);
					wallSprite.x =
						localPosition.x + ROOM_WALL_L_OFFSET_X;
					wallSprite.y =
						localPosition.y + ROOM_WALL_L_OFFSET_Y + 4;
					wallSprite.zIndex = calculateZIndex(
						i,
						j,
						0,
						PRIORITY_WALL,
					);
					this.roomContainer.addChild(wallSprite);
					break;
				}
			}
		}
	}

	renderFloor(model: RoomModel): void {
		const {
			roomTileTexture,
			roomStairLTexture,
			roomStairRTexture,
		} = this.roomImager;
		if (!roomTileTexture) return;

		for (let i = 0; i < model.maxX; i++) {
			for (let j = 0; j < model.maxY; j++) {
				const tile = model.getTile(i, j);
				if (tile > 0) {
					let texture = roomTileTexture;

					if (
						model.isValidTile(i + 1, j) &&
						model.getTile(i + 1, j) < tile
					) {
						if (roomStairLTexture) texture = roomStairLTexture;
					} else if (
						model.isValidTile(i - 1, j) &&
						model.getTile(i - 1, j) > tile
					) {
						continue;
					} else if (
						model.isValidTile(i, j - 1) &&
						model.getTile(i, j - 1) > tile
					) {
						continue;
					} else if (
						model.isValidTile(i, j + 1) &&
						model.getTile(i, j + 1) < tile
					) {
						if (roomStairRTexture) {
							texture = roomStairRTexture;
							const floorSprite = new Sprite(texture);
							const localPosition = tileToLocal(
								i,
								j,
								tile - 1,
							);
							floorSprite.x = localPosition.x - 34;
							floorSprite.y = localPosition.y;
							floorSprite.zIndex = calculateZIndex(
								i,
								j,
								0,
								model.doorX === i && model.doorY === j
									? PRIORITY_DOOR_FLOOR
									: PRIORITY_FLOOR,
							);
							this.roomContainer.addChild(floorSprite);
							continue;
						}
					}

					const floorSprite = new Sprite(texture);
					const localPosition = tileToLocal(i, j, tile - 1);
					floorSprite.x = localPosition.x;
					floorSprite.y = localPosition.y;
					floorSprite.zIndex = calculateZIndex(
						i,
						j,
						0,
						model.doorX === i && model.doorY === j
							? PRIORITY_DOOR_FLOOR
							: PRIORITY_FLOOR,
					);
					this.roomContainer.addChild(floorSprite);
				}
			}
		}
	}

	async addAvatar(
		id: number,
		name: string,
		figure: string,
		x: number,
		y: number,
		z: number,
		direction: Direction,
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

		const tileZ =
			this.currentModel.isValidTile(x, y)
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

	async loadAvatarTextures(avatar: RoomAvatar): Promise<void> {
		const directions: Array<Direction> = [0, 1, 2, 3, 4, 5, 6, 7];
		const promises: Array<Promise<void>> = [];

		for (const direction of directions) {
			promises.push(
				this.loadBodyTexture(avatar, direction, ["std"], 0),
			);
			promises.push(
				this.loadHeadTexture(avatar, direction, "std", 0),
			);
			promises.push(
				this.loadHeadTexture(avatar, direction, "eyb", 0),
			);
			for (let j = 0; j <= 3; j++) {
				promises.push(
					this.loadBodyTexture(
						avatar,
						direction,
						["wlk"],
						j,
					),
				);
			}
			for (let j = 0; j <= 1; j++) {
				promises.push(
					this.loadBodyTexture(
						avatar,
						direction,
						["wav"],
						j,
					),
				);
				promises.push(
					this.loadHeadTexture(avatar, direction, "spk", j),
				);
			}
		}

		for (let i = 0; i <= 7; i += 2) {
			promises.push(
				this.loadBodyTexture(
					avatar,
					i as Direction,
					["sit"],
					0,
				),
			);
		}

		await Promise.all(promises);
	}

	async loadBodyTexture(
		avatar: RoomAvatar,
		direction: Direction,
		action: Array<string>,
		frame: number,
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
			"n",
		);
		const image = await this.avatarImager.generateGeneric(
			info,
			false,
		);
		const key = `${direction}_${action.join("-")}_${frame}`;
		avatar.bodyTextures[key] = Texture.from(image);
	}

	async loadHeadTexture(
		avatar: RoomAvatar,
		direction: Direction,
		gesture: string,
		frame: number,
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
			"n",
		);
		const image = await this.avatarImager.generateGeneric(
			info,
			false,
		);
		const key = `${direction}_${gesture}_${frame}`;
		avatar.headTextures[key] = Texture.from(image);
	}

	updateAvatarTexture(avatar: RoomAvatar): void {
		if (!avatar.loaded) return;

		const bodyKey = `${avatar.direction}_std_0`;
		const headKey = `${avatar.direction}_std_0`;

		const gesture =
			avatar.frame % 40 < 2 ? "eyb" : "std";
		const headGestureKey = `${avatar.direction}_${gesture}_0`;

		if (avatar.bodyTextures[bodyKey]) {
			avatar.bodySprite.texture = avatar.bodyTextures[bodyKey];
		}
		if (avatar.headTextures[headGestureKey]) {
			avatar.headSprite.texture =
				avatar.headTextures[headGestureKey];
		} else if (avatar.headTextures[headKey]) {
			avatar.headSprite.texture = avatar.headTextures[headKey];
		}
	}

	updateAvatarSpritePosition(avatar: RoomAvatar): void {
		const localPosition = tileToLocal(
			avatar.x,
			avatar.y,
			avatar.z,
		);
		const offsetX =
			avatar.direction === 6 ||
			avatar.direction === 5 ||
			avatar.direction === 4
				? ROOM_USER_SPRITE_OFFSET_X
				: 0;
		avatar.container.x = Math.round(localPosition.x + offsetX);
		avatar.container.y = Math.round(
			localPosition.y + ROOM_USER_SPRITE_OFFSET_Y,
		);

		const shadowCoords = tileToLocal(avatar.x, avatar.y, avatar.z);
		avatar.shadowSprite.x = shadowCoords.x;
		avatar.shadowSprite.y = shadowCoords.y;

		avatar.shadowSprite.zIndex = calculateZIndex(
			avatar.x,
			avatar.y,
			0,
			PRIORITY_PLAYER_SHADOW,
		);
		avatar.container.zIndex = calculateZIndex(
			avatar.x,
			avatar.y,
			avatar.z,
			PRIORITY_PLAYER,
		);
	}

	removeAvatar(id: number): void {
		const avatar = this.avatars.get(id);
		if (avatar) {
			this.roomContainer.removeChild(avatar.container);
			this.roomContainer.removeChild(avatar.shadowSprite);
			this.avatars.delete(id);
		}
	}

	moveAvatar(id: number, x: number, y: number, direction: Direction): void {
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

	setAvatarDirection(id: number, direction: Direction): void {
		const avatar = this.avatars.get(id);
		if (avatar) {
			avatar.direction = direction;
			this.updateAvatarSpritePosition(avatar);
			this.updateAvatarTexture(avatar);
		}
	}

	gameLoop = (delta: number): void => {
		if (this._destroyed) return;
		const deltaMs = delta * (1 / 60) * 1000;
		for (const avatar of this.avatars.values()) {
			avatar.frameCounter += deltaMs;
			if (avatar.frameCounter >= FRAME_SPEED) {
				avatar.frame++;
				avatar.frameCounter = 0;
				this.updateAvatarTexture(avatar);
			}
		}
	};

	destroy(): void {
		this._destroyed = true;
		this.app.destroy(true, { children: true, texture: true });
	}
}
