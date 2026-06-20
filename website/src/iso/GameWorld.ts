/**
 * The top-level world controller.
 *
 * `GameWorld` owns the PixiJS application (WebGPU-preferred), the active room,
 * every agent, and the render loop. It exposes the authoritative entry point
 * {@link GameWorld.updateAgentState} for external/AI control, plus click-to-move
 * for human debugging. The 600x600 native scene lives inside a single "viewport"
 * container that is scaled to fill its parent, so the world stays crisp pixel
 * art at any size.
 */

import {
	Application,
	BitmapFont,
	Container,
	Graphics,
	Rectangle,
	TextureSource,
	type FederatedPointerEvent,
	type Ticker,
} from "pixi.js";

import { Agent } from "./Agent";
import type { BaseRoom } from "./BaseRoom";
import { ChatBubble } from "./ChatBubble";
import type { FurnitureStation } from "./furniture";
import {
	LAYER_DECAL,
	NATIVE_RESOLUTION,
	depthAt,
	screenToTile,
} from "./geometry";
import { ROOM_REGISTRY, type RoomEntry } from "./rooms";
import { TextureFactory } from "./textures";
import type { AgentState, ChatMessage, WalkNode } from "./types";

const NAMEPLATE_FONT = "iso-body";
const BUBBLE_FONT = "iso-bubble";
const FONT_CHARACTERS: Array<Array<string> | string> = [
	["a", "z"],
	["A", "Z"],
	["0", "9"],
	" .,!?:;@#%&()'\"-_/+*",
];

const CAMERA_PADDING = 28;
const ZOOM_BOOST = 1.08;
const TAP_THRESHOLD = 6;
const AGENT_PICK_RADIUS = 26;
const PAN_LIMIT = 360;

const AGENT_TINTS = [
	0xf2a154, 0x5aa9e6, 0x7fc8a9, 0xe88ec2, 0xc3a6ff, 0xffd166, 0x9ad0ec,
	0xf28482, 0x84dcc6, 0xbdb2ff,
];
// "antenna" is weighted heavier so it stays the common plain look.
const ACCESSORY_KINDS = [
	"antenna",
	"antenna",
	"antenna",
	"cap",
	"beanie",
	"party",
	"bow",
	"crown",
	"glasses",
	"headphones",
	"flower",
];
const ACCESSORY_TINTABLE = new Set(["cap", "beanie", "party", "bow"]);
const ACCESSORY_COLORS = [
	0xff6b6b, 0x4ecdc4, 0xffd166, 0xa78bfa, 0xff8fab, 0x6bcb77, 0x5aa9e6,
];
const AGENT_NAMES = [
	"Atlas",
	"Vega",
	"Juno",
	"Nova",
	"Pixel",
	"Echo",
	"Sol",
	"Iris",
	"Kai",
	"Lumen",
	"Orbit",
	"Sage",
	"Bishop",
	"Wren",
	"Dot",
	"Cleo",
];
const AMBIENT_LINES = [
	"gm",
	"any seats open?",
	"running the numbers...",
	"all in!",
	"let me think",
	"objection!",
	"who's dealing?",
	"brb, coffee",
	"nice play",
	"on my way",
	"wen payout",
	"this rug ties the room together",
];

function clamp(value: number, low: number, high: number): number {
	return Math.max(low, Math.min(high, value));
}

// Bitmap fonts are global to PixiJS, so they only need installing once even if
// several worlds mount over a session (e.g. React strict-mode double-mounts).
let fontsInstalled = false;

export interface AgentSummary {
	id: string;
	label: string;
}

export class GameWorld {
	private app: Application | null = null;
	private factory: TextureFactory | null = null;

	private readonly viewport = new Container();
	private readonly camera = new Container();
	private readonly world = new Container();
	private readonly bubbleLayer = new Container();
	private readonly glow = new Graphics();
	private readonly selectionRing = new Graphics();

	private room: BaseRoom | null = null;
	private roomKey = ROOM_REGISTRY[0]!.key;
	private readonly agents = new Map<string, Agent>();
	private readonly bubbles = new Map<string, ChatBubble>();
	private readonly wanderTimers = new Map<string, number>();
	private selectedId: string | null = null;
	private autonomous = false;
	private resizeObserver: ResizeObserver | null = null;
	private changeListener: (() => void) | null = null;

	private pointerActive = false;
	private pointerMoved = 0;
	private lastPointerX = 0;
	private lastPointerY = 0;

	// ---- Lifecycle ----------------------------------------------------------

	public async init(parent: HTMLElement): Promise<void> {
		if (this.app) {
			return;
		}
		TextureSource.defaultOptions.scaleMode = "nearest";

		const app = new Application();
		await app.init({
			width: NATIVE_RESOLUTION,
			height: NATIVE_RESOLUTION,
			antialias: true,
			preference: "webgpu",
			powerPreference: "high-performance",
			resolution: globalThis.devicePixelRatio || 1,
			autoDensity: true,
			backgroundAlpha: 1,
			background: 0x0c0f16,
		});
		this.app = app;
		this.factory = new TextureFactory(app.renderer);

		this.installFonts();

		this.world.sortableChildren = true;
		this.selectionRing.visible = false;
		this.world.addChild(this.selectionRing);
		this.camera.addChild(this.glow, this.world, this.bubbleLayer);
		this.viewport.addChild(this.camera);
		app.stage.addChild(this.viewport);

		app.stage.eventMode = "static";
		app.stage.hitArea = app.screen;
		app.stage.on("pointerdown", this.onPointerDown);
		app.stage.on("pointermove", this.onPointerMove);
		app.stage.on("pointerup", this.onPointerUp);
		app.stage.on("pointerupoutside", this.onPointerUp);

		parent.appendChild(app.canvas);
		this.observeResize(parent);
		this.setRoom(this.roomKey);
		app.ticker.add(this.tick);
	}

	private installFonts(): void {
		if (fontsInstalled) {
			return;
		}
		fontsInstalled = true;
		BitmapFont.install({
			name: NAMEPLATE_FONT,
			style: {
				fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
				fontSize: 26,
				fontWeight: "700",
				fill: 0xffffff,
				stroke: { color: 0x10131c, width: 4 },
			},
			chars: FONT_CHARACTERS,
			resolution: 2,
			textureStyle: { scaleMode: "nearest" },
		});
		BitmapFont.install({
			name: BUBBLE_FONT,
			style: {
				fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
				fontSize: 26,
				fontWeight: "600",
				fill: 0x10131c,
			},
			chars: FONT_CHARACTERS,
			resolution: 2,
			textureStyle: { scaleMode: "nearest" },
		});
	}

	public destroy(): void {
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.factory?.destroy();
		const app = this.app;
		this.app = null;
		if (app) {
			app.ticker.remove(this.tick);
			app.destroy(true, { children: true, texture: true });
		}
	}

	public setChangeListener(listener: (() => void) | null): void {
		this.changeListener = listener;
	}

	// ---- Room management ----------------------------------------------------

	public get rooms(): ReadonlyArray<RoomEntry> {
		return ROOM_REGISTRY;
	}

	public get currentRoomKey(): string {
		return this.roomKey;
	}

	public setRoom(key: string): void {
		const entry = ROOM_REGISTRY.find((candidate) => candidate.key === key);
		const factory = this.factory;
		const app = this.app;
		if (!entry || !factory || !app) {
			return;
		}
		this.clearAgents();
		if (this.room) {
			this.world.removeChild(this.room.view);
			this.room.view.destroy({ children: true });
		}
		this.roomKey = key;
		this.room = entry.create(factory);
		this.world.addChild(this.room.view);

		const palette = this.room.definition.palette;
		app.renderer.background.color = palette.background;
		this.paintGlow(palette.accent);

		const center = this.room.pixelCenter;
		this.world.position.set(-center.x, -center.y);
		this.bubbleLayer.position.copyFrom(this.world.position);

		const size = this.room.pixelSize;
		// Fit the room into the viewport, then nudge it up a touch so the world
		// fills more of the frame (panning covers any slight overflow).
		const zoom = clamp(
			Math.min(
				(NATIVE_RESOLUTION - CAMERA_PADDING * 2) / size.width,
				(NATIVE_RESOLUTION - CAMERA_PADDING * 2) / size.height
			) * ZOOM_BOOST,
			0.6,
			1.6
		);
		this.camera.scale.set(zoom);
		this.camera.position.set(NATIVE_RESOLUTION / 2, NATIVE_RESOLUTION / 2);
		this.notifyChange();
	}

	private paintGlow(accent: number): void {
		this.glow.clear();
		this.glow.ellipse(0, 0, 320, 200).fill({ color: accent, alpha: 0.1 });
		this.glow.position.set(0, 0);
	}

	// ---- Agent control ------------------------------------------------------

	/**
	 * Authoritative reconciliation entry point. A controller pushes where an
	 * agent should be and what it should do; the world spawns it if new and
	 * slides it toward that state. Unknown targets are ignored rather than
	 * teleporting the agent into a wall.
	 */
	public updateAgentState(agentId: string, state: AgentState): void {
		const room = this.room;
		if (!room) {
			return;
		}
		let agent = this.agents.get(agentId);
		if (!agent) {
			const spawn = room.isWalkable(state.x, state.y)
				? room.node(state.x, state.y)
				: room.spawnNode();
			agent = this.createAgent(
				agentId,
				state.tint ?? this.pickTint(agentId),
				state.label ?? agentId,
				spawn
			);
		} else {
			if (state.label !== undefined) {
				agent.setLabel(state.label);
			}
			if (state.tint !== undefined) {
				agent.setTint(state.tint);
			}
		}
		if (state.speed !== undefined) {
			agent.setSpeed(state.speed);
		}

		this.routeAgent(agent, state);

		if (state.say) {
			this.speak(agentId, state.say);
		}
	}

	private routeAgent(agent: Agent, state: AgentState): void {
		const room = this.room!;
		const start = agent.currentTile;
		const startX = Math.round(start.x);
		const startY = Math.round(start.y);

		let arrivalAction = state.action ?? "idle";
		let facing = state.facing ?? null;
		let seatDrop = 0;
		const station = room.stationAt(state.x, state.y);
		if (
			station &&
			(state.action === "sitting" || state.action === "inspecting")
		) {
			arrivalAction = station.point.action === "sit" ? "sitting" : "inspecting";
			facing = station.point.facing ?? facing;
			seatDrop = station.point.seatDropY ?? 6;
		}

		if (startX === state.x && startY === state.y) {
			agent.walkPath([], arrivalAction, facing, seatDrop);
			return;
		}
		const path = room.findPath(startX, startY, state.x, state.y);
		if (path) {
			agent.walkPath(path, arrivalAction, facing, seatDrop);
		}
	}

	public speak(agentId: string, message: ChatMessage): void {
		const factory = this.factory;
		const agent = this.agents.get(agentId);
		if (!factory || !agent) {
			return;
		}
		this.bubbles.get(agentId)?.dismiss();
		const bubble = new ChatBubble({
			background: factory.bubbleBackground(),
			tail: factory.bubbleTail(),
			fontName: BUBBLE_FONT,
			text: message.text,
			durationMs: message.durationMs,
		});
		this.bubbleLayer.addChild(bubble);
		this.bubbles.set(agentId, bubble);
	}

	/** Make a random handful of agents pipe up — used by the demo controls. */
	public nudgeChatter(): void {
		for (const agent of this.agents.values()) {
			if (Math.random() < 0.6) {
				this.speak(agent.agentId, { text: this.pickAmbientLine() });
			}
		}
	}

	public removeAgent(agentId: string): void {
		const agent = this.agents.get(agentId);
		if (!agent) {
			return;
		}
		this.bubbles.get(agentId)?.dismiss();
		this.world.removeChild(agent);
		agent.destroy({ children: true });
		this.agents.delete(agentId);
		this.wanderTimers.delete(agentId);
		if (this.selectedId === agentId) {
			this.selectedId = null;
			this.selectionRing.visible = false;
		}
		this.notifyChange();
	}

	public clearAgents(): void {
		for (const agent of this.agents.values()) {
			this.world.removeChild(agent);
			agent.destroy({ children: true });
		}
		this.agents.clear();
		this.wanderTimers.clear();
		for (const bubble of this.bubbles.values()) {
			bubble.destroy({ children: true });
		}
		this.bubbles.clear();
		this.selectedId = null;
		this.selectionRing.visible = false;
		this.notifyChange();
	}

	/** Populate the room with demo agents — some seated at stations. */
	public spawnAgents(count: number): void {
		const room = this.room;
		if (!room) {
			return;
		}
		const freeStations = room
			.stations()
			.filter((station) => !this.tileOccupied(station.tileX, station.tileY));
		const walkable = room.walkableNodes();
		for (let index = 0; index < count; index++) {
			const id = `agent-${Date.now().toString(36)}-${index}`;
			const station = freeStations.shift();
			if (station) {
				const agent = this.createAgent(
					id,
					this.pickTint(id),
					this.pickName(),
					room.node(station.tileX, station.tileY)
				);
				agent.walkPath(
					[],
					station.point.action === "sit" ? "sitting" : "inspecting",
					station.point.facing ?? null,
					station.point.seatDropY ?? 6
				);
			} else {
				const node = this.randomFreeNode(walkable);
				if (node) {
					this.createAgent(id, this.pickTint(id), this.pickName(), node);
				}
			}
		}
	}

	public setAutonomous(enabled: boolean): void {
		this.autonomous = enabled;
	}

	public get agentSummaries(): Array<AgentSummary> {
		return [...this.agents.values()].map((agent) => ({
			id: agent.agentId,
			label: agent.agentId,
		}));
	}

	public get agentCount(): number {
		return this.agents.size;
	}

	private createAgent(
		id: string,
		tint: number,
		label: string,
		spawn: WalkNode
	): Agent {
		const factory = this.factory!;
		const accessoryKind =
			ACCESSORY_KINDS[this.hash(id) % ACCESSORY_KINDS.length]!;
		const accessoryTint = ACCESSORY_TINTABLE.has(accessoryKind)
			? ACCESSORY_COLORS[this.hash(`${id}:acc`) % ACCESSORY_COLORS.length]!
			: 0xffffff;
		const agent = new Agent({
			id,
			body: factory.agentBody(),
			face: factory.agentFace(),
			shadow: factory.agentShadow(),
			accessory: factory.accessory(accessoryKind),
			accessoryTint,
			fontName: NAMEPLATE_FONT,
			tint,
			label,
			spawn,
		});
		this.world.addChild(agent);
		this.agents.set(id, agent);
		this.wanderTimers.set(id, this.randomWanderDelay());
		this.notifyChange();
		return agent;
	}

	// ---- Render loop --------------------------------------------------------

	private readonly tick = (ticker: Ticker): void => {
		const deltaMs = ticker.deltaMS;
		const deltaSeconds = deltaMs / 1000;

		for (const agent of this.agents.values()) {
			if (this.autonomous) {
				this.stepWander(agent, deltaMs);
			}
			agent.tick(deltaSeconds);
		}

		for (const [id, bubble] of this.bubbles) {
			const agent = this.agents.get(id);
			if (agent) {
				bubble.position.set(agent.x, agent.y + agent.headOffsetY);
			}
			if (!bubble.update(deltaMs)) {
				this.bubbleLayer.removeChild(bubble);
				bubble.destroy({ children: true });
				this.bubbles.delete(id);
			}
		}

		this.updateSelectionRing();
	};

	private stepWander(agent: Agent, deltaMs: number): void {
		if (agent.currentAction !== "idle") {
			return;
		}
		const remaining = (this.wanderTimers.get(agent.agentId) ?? 0) - deltaMs;
		if (remaining > 0) {
			this.wanderTimers.set(agent.agentId, remaining);
			return;
		}
		this.wanderTimers.set(agent.agentId, this.randomWanderDelay());
		const room = this.room!;
		const target = this.randomFreeNode(room.walkableNodes());
		const start = agent.currentTile;
		if (target) {
			const path = room.findPath(
				Math.round(start.x),
				Math.round(start.y),
				target.x,
				target.y
			);
			if (path && path.length > 0) {
				agent.walkPath(path, "idle", null, 0);
			}
		}
		if (Math.random() < 0.4) {
			this.speak(agent.agentId, { text: this.pickAmbientLine() });
		}
	}

	private updateSelectionRing(): void {
		if (!this.selectedId) {
			return;
		}
		const agent = this.agents.get(this.selectedId);
		if (!agent) {
			this.selectionRing.visible = false;
			return;
		}
		this.selectionRing.visible = true;
		this.selectionRing.position.set(agent.x, agent.y);
		this.selectionRing.zIndex = agent.zIndex - 0.5;
	}

	// ---- Pointer input ------------------------------------------------------

	private readonly onPointerDown = (event: FederatedPointerEvent): void => {
		this.pointerActive = true;
		this.pointerMoved = 0;
		this.lastPointerX = event.global.x;
		this.lastPointerY = event.global.y;
	};

	private readonly onPointerMove = (event: FederatedPointerEvent): void => {
		if (!this.pointerActive) {
			return;
		}
		const deltaX = event.global.x - this.lastPointerX;
		const deltaY = event.global.y - this.lastPointerY;
		this.lastPointerX = event.global.x;
		this.lastPointerY = event.global.y;
		this.pointerMoved += Math.abs(deltaX) + Math.abs(deltaY);
		const scale = this.viewport.scale.x || 1;
		this.camera.position.set(
			clamp(
				this.camera.position.x + deltaX / scale,
				NATIVE_RESOLUTION / 2 - PAN_LIMIT,
				NATIVE_RESOLUTION / 2 + PAN_LIMIT
			),
			clamp(
				this.camera.position.y + deltaY / scale,
				NATIVE_RESOLUTION / 2 - PAN_LIMIT,
				NATIVE_RESOLUTION / 2 + PAN_LIMIT
			)
		);
	};

	private readonly onPointerUp = (event: FederatedPointerEvent): void => {
		if (this.pointerActive && this.pointerMoved < TAP_THRESHOLD) {
			this.handleTap(event);
		}
		this.pointerActive = false;
	};

	private handleTap(event: FederatedPointerEvent): void {
		const room = this.room;
		if (!room) {
			return;
		}
		const local = this.world.toLocal(event.global);
		const picked = this.pickAgentAt(local.x, local.y);
		if (picked) {
			this.selectedId = picked.agentId;
			return;
		}
		const tile = screenToTile(local.x, local.y);
		const tileX = Math.floor(tile.x);
		const tileY = Math.floor(tile.y);
		const agent = this.selectedId
			? this.agents.get(this.selectedId)
			: undefined;
		if (!agent) {
			return;
		}
		// Walkable floor → walk there. Otherwise, if an interactable furniture
		// piece was tapped, send the agent to one of its free stations.
		if (room.isWalkable(tileX, tileY)) {
			this.routeAgentToTile(agent, tileX, tileY, "idle", null, 0);
			return;
		}
		const stations = room.pieceStationsAt(tileX, tileY);
		if (stations.length === 0) {
			return;
		}
		const station =
			stations.find(
				(candidate) => !this.tileOccupied(candidate.tileX, candidate.tileY)
			) ?? stations[0]!;
		const isSit = station.point.action === "sit";
		this.routeAgentToTile(
			agent,
			station.tileX,
			station.tileY,
			isSit ? "sitting" : "inspecting",
			station.point.facing ?? null,
			isSit ? (station.point.seatDropY ?? 6) : 0
		);
	}

	private routeAgentToTile(
		agent: Agent,
		tileX: number,
		tileY: number,
		arrivalAction: Parameters<Agent["walkPath"]>[1],
		facing: FurnitureStation["point"]["facing"] | null,
		seatDropY: number
	): void {
		const room = this.room;
		if (!room) {
			return;
		}
		const start = agent.currentTile;
		const path = room.findPath(
			Math.round(start.x),
			Math.round(start.y),
			tileX,
			tileY
		);
		if (path) {
			agent.walkPath(path, arrivalAction, facing ?? null, seatDropY);
		}
	}

	private pickAgentAt(localX: number, localY: number): Agent | undefined {
		let best: Agent | undefined;
		let bestDistance = AGENT_PICK_RADIUS;
		for (const agent of this.agents.values()) {
			const distance = Math.hypot(agent.x - localX, agent.y - localY + 20);
			if (distance < bestDistance) {
				bestDistance = distance;
				best = agent;
			}
		}
		return best;
	}

	// ---- Resize -------------------------------------------------------------

	private observeResize(parent: HTMLElement): void {
		this.selectionRing.clear();
		this.selectionRing
			.ellipse(0, 0, 16, 8)
			.stroke({ color: 0xffffff, width: 2, alpha: 0.85 });
		this.selectionRing.zIndex = depthAt(0, 0, 0, LAYER_DECAL);
		this.applySize(parent.clientWidth || NATIVE_RESOLUTION);
		this.resizeObserver = new ResizeObserver((entries) => {
			const width = entries[0]?.contentRect.width ?? NATIVE_RESOLUTION;
			this.applySize(width);
		});
		this.resizeObserver.observe(parent);
	}

	private applySize(width: number): void {
		const app = this.app;
		if (!app || width <= 0) {
			return;
		}
		const size = Math.round(width);
		app.renderer.resize(size, size);
		app.stage.hitArea = new Rectangle(0, 0, size, size);
		this.viewport.scale.set(size / NATIVE_RESOLUTION);
	}

	// ---- Small helpers ------------------------------------------------------

	private tileOccupied(tileX: number, tileY: number): boolean {
		for (const agent of this.agents.values()) {
			const tile = agent.currentTile;
			if (Math.round(tile.x) === tileX && Math.round(tile.y) === tileY) {
				return true;
			}
		}
		return false;
	}

	private randomFreeNode(nodes: Array<WalkNode>): WalkNode | undefined {
		const free = nodes.filter((node) => !this.tileOccupied(node.x, node.y));
		const pool = free.length > 0 ? free : nodes;
		if (pool.length === 0) {
			return undefined;
		}
		const index = Math.floor(Math.random() * pool.length);
		return pool[index];
	}

	private hash(seed: string): number {
		let value = 0;
		for (let index = 0; index < seed.length; index++) {
			value = (value * 31 + seed.charCodeAt(index)) >>> 0;
		}
		return value;
	}

	private pickTint(seed: string): number {
		return AGENT_TINTS[this.hash(seed) % AGENT_TINTS.length]!;
	}

	private pickName(): string {
		return AGENT_NAMES[Math.floor(Math.random() * AGENT_NAMES.length)]!;
	}

	private pickAmbientLine(): string {
		return AMBIENT_LINES[Math.floor(Math.random() * AMBIENT_LINES.length)]!;
	}

	private randomWanderDelay(): number {
		return 2200 + Math.random() * 3600;
	}

	private notifyChange(): void {
		this.changeListener?.();
	}
}
