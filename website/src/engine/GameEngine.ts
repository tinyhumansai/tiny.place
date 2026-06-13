import Phaser from "phaser";
import type RoomModel from "./RoomModel";
import type { RoomTheme } from "./RoomTheme";
import RoomScene from "./RoomScene";
import type { Direction } from "./types";

export default class GameEngine {
	private game: Phaser.Game | null;
	private scene: RoomScene | null;
	private readonly readyPromise: Promise<void>;
	private resolveReady!: () => void;
	public currentModel: RoomModel | null;

	public constructor() {
		this.game = null;
		this.scene = null;
		this.currentModel = null;
		this.readyPromise = new Promise((resolve) => {
			this.resolveReady = resolve;
		});
	}

	public async initialize(): Promise<void> {
		// No-op — actual initialization happens in mount()
	}

	public mount(container: HTMLElement): void {
		const config: Phaser.Types.Core.GameConfig = {
			type: Phaser.CANVAS,
			parent: container,
			width: container.clientWidth,
			height: container.clientHeight,
			backgroundColor: "#1a1a2e",
			scene: [RoomScene],
			scale: {
				mode: Phaser.Scale.NONE,
			},
			render: {
				pixelArt: false,
				antialias: false,
			},
			audio: {
				noAudio: true,
			},
		};

		this.game = new Phaser.Game(config);
		this.game.events.once("ready", () => {
			this.scene = this.game!.scene.getScene("RoomScene") as RoomScene;
			this.resolveReady();
		});
	}

	public resize(width: number, height: number): void {
		this.game?.scale.resize(width, height);
	}

	public async loadRoom(model: RoomModel, theme?: RoomTheme): Promise<void> {
		await this.readyPromise;
		this.currentModel = model;
		this.scene?.loadRoom(model, theme);
	}

	public centerCamera(): void {
		this.scene?.centerCamera();
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
		await this.readyPromise;
		await this.scene?.addAvatar(id, name, figure, x, y, z, direction);
	}

	public removeAvatar(id: number): void {
		this.scene?.removeAvatar(id);
	}

	public moveAvatar(
		id: number,
		x: number,
		y: number,
		direction: Direction
	): void {
		this.scene?.moveAvatar(id, x, y, direction);
	}

	public enableAutonomy(id: number): void {
		this.scene?.enableAutonomy(id);
	}

	public destroy(): void {
		this.game?.destroy(true);
		this.game = null;
		this.scene = null;
	}
}
