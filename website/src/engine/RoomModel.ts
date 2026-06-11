import {
	type RoomTheme,
	CHAT_THEME,
	POKER_THEME,
	COURT_THEME,
	MARKETPLACE_THEME,
	LEADERBOARD_THEME,
} from "./RoomTheme";

export default class RoomModel {
	public maxX: number;
	public maxY: number;
	public doorX: number;
	public doorY: number;
	public heightMap: Array<Array<number>>;

	public constructor(
		maxX: number,
		maxY: number,
		doorX: number,
		doorY: number,
		heightMap: Array<Array<number>>
	) {
		this.maxX = maxX;
		this.maxY = maxY;
		this.doorX = doorX;
		this.doorY = doorY;
		this.heightMap = heightMap;
	}

	public isValidTile(x: number, y: number): boolean {
		return (
			x >= 0 &&
			x < this.maxX &&
			y >= 0 &&
			y < this.maxY &&
			this.getTile(x, y) !== 0
		);
	}

	public getTile(x: number, y: number): number {
		return this.heightMap[x]?.[y] ?? 0;
	}

	public getValidTiles(): Array<{ x: number; y: number }> {
		const tiles: Array<{ x: number; y: number }> = [];
		for (let x = 0; x < this.maxX; x++) {
			for (let y = 0; y < this.maxY; y++) {
				if (this.isValidTile(x, y)) {
					tiles.push({ x, y });
				}
			}
		}
		return tiles;
	}

	public findPath(
		startX: number,
		startY: number,
		endX: number,
		endY: number,
		blockedTiles?: Set<string>
	): Array<{ x: number; y: number }> | null {
		if (!this.isValidTile(startX, startY) || !this.isValidTile(endX, endY)) {
			return null;
		}
		if (startX === endX && startY === endY) return [];

		const neighbors = [
			[0, -1],
			[1, 0],
			[0, 1],
			[-1, 0],
			[1, -1],
			[1, 1],
			[-1, 1],
			[-1, -1],
		];

		const visited = new Set<string>();
		const queue: Array<{
			x: number;
			y: number;
			path: Array<{ x: number; y: number }>;
		}> = [];
		const startKey = `${startX},${startY}`;
		visited.add(startKey);
		queue.push({ x: startX, y: startY, path: [] });

		while (queue.length > 0) {
			const current = queue.shift()!;

			for (const [dx, dy] of neighbors) {
				const nx = current.x + dx!;
				const ny = current.y + dy!;
				const key = `${nx},${ny}`;

				if (visited.has(key) || !this.isValidTile(nx, ny)) continue;

				if (blockedTiles?.has(key) && !(nx === endX && ny === endY)) continue;

				const heightDifference = Math.abs(
					this.getTile(nx, ny) - this.getTile(current.x, current.y)
				);
				if (heightDifference > 1) continue;

				const step = { x: nx, y: ny };
				const newPath = [...current.path, step];

				if (nx === endX && ny === endY) return newPath;

				visited.add(key);
				queue.push({ x: nx, y: ny, path: newPath });
			}
		}

		return null;
	}
}

export function createDefaultRoom(): RoomModel {
	const heightMap = [
		[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	];
	return new RoomModel(10, 10, 1, 1, heightMap);
}

export function createLShapedRoom(): RoomModel {
	const heightMap = [
		[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0],
		[0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0],
		[0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	];
	return new RoomModel(9, 12, 1, 1, heightMap);
}

export function createMultiLevelRoom(): RoomModel {
	const heightMap = [
		[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 2, 2, 2, 2, 1, 1, 1, 1, 0],
		[0, 2, 2, 2, 2, 1, 1, 1, 1, 0],
		[0, 2, 2, 2, 2, 1, 1, 1, 1, 0],
		[0, 2, 2, 2, 2, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	];
	return new RoomModel(10, 10, 5, 1, heightMap);
}

function seededRandom(seed: number): () => number {
	let state = seed;
	return (): number => {
		state = (state * 1664525 + 1013904223) & 0xffffffff;
		return (state >>> 0) / 0xffffffff;
	};
}

export type RoomPreset = {
	key: string;
	label: string;
	description: string;
	capacity: number;
	color: string;
	theme?: RoomTheme;
	factory: () => RoomModel;
};

export function createChatRoom(): RoomModel {
	const heightMap = [
		[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	];
	return new RoomModel(12, 14, 1, 1, heightMap);
}

export function createPokerRoom(): RoomModel {
	const heightMap = [
		[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	];
	return new RoomModel(12, 14, 1, 1, heightMap);
}

export function createCourtRoom(): RoomModel {
	const heightMap = [
		[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	];
	return new RoomModel(12, 16, 1, 1, heightMap);
}

export function createMarketplaceRoom(): RoomModel {
	const heightMap = [
		[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	];
	return new RoomModel(11, 18, 3, 5, heightMap);
}

export function createLeaderboardRoom(): RoomModel {
	const heightMap = [
		[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	];
	return new RoomModel(11, 12, 1, 1, heightMap);
}

export const ROOM_TYPE_PRESETS: Array<RoomPreset> = [
	{
		key: "chatroom",
		label: "Chat Room",
		description: "Open conversation space for 1-on-1 or groups up to 500",
		capacity: 500,
		color: "#3b82f6",
		theme: CHAT_THEME,
		factory: createChatRoom,
	},
	{
		key: "poker",
		label: "Poker Room",
		description: "Oval table with raised center for card games",
		capacity: 10,
		color: "#10b981",
		theme: POKER_THEME,
		factory: createPokerRoom,
	},
	{
		key: "court",
		label: "Court Room",
		description: "Raised judge bench, partitioned areas for dispute resolution",
		capacity: 50,
		color: "#8b5cf6",
		theme: COURT_THEME,
		factory: createCourtRoom,
	},
	{
		key: "marketplace",
		label: "Marketplace",
		description: "Market stalls with walkways for browsing and trading",
		capacity: 200,
		color: "#f59e0b",
		theme: MARKETPLACE_THEME,
		factory: createMarketplaceRoom,
	},
	{
		key: "leaderboard",
		label: "Leaderboard",
		description: "Podium-style room with tiered platforms for rankings",
		capacity: 100,
		color: "#ef4444",
		theme: LEADERBOARD_THEME,
		factory: createLeaderboardRoom,
	},
];

export function createRandomRoom(seed: number): RoomModel {
	const random = seededRandom(seed);

	const width = Math.floor(random() * 8) + 12;
	const height = Math.floor(random() * 8) + 12;
	const maxX = width + 2;
	const maxY = height + 2;

	const heightMap: Array<Array<number>> = [];
	for (let x = 0; x < maxX; x++) {
		heightMap.push(new Array<number>(maxY).fill(0));
	}

	for (let x = 1; x <= width; x++) {
		for (let y = 1; y <= height; y++) {
			heightMap[x]![y] = 1;
		}
	}

	const cutCount = Math.floor(random() * 3) + 1;
	for (let index = 0; index < cutCount; index++) {
		const cutW = Math.floor(random() * 4) + 2;
		const cutH = Math.floor(random() * 4) + 2;

		const corner = Math.floor(random() * 4);
		for (let x = 0; x < cutW; x++) {
			for (let y = 0; y < cutH; y++) {
				let tileX: number;
				let tileY: number;
				switch (corner) {
					case 0:
						tileX = 1 + x;
						tileY = 1 + y;
						break;
					case 1:
						tileX = width - x;
						tileY = 1 + y;
						break;
					case 2:
						tileX = 1 + x;
						tileY = height - y;
						break;
					default:
						tileX = width - x;
						tileY = height - y;
						break;
				}
				if (tileX >= 1 && tileX <= width && tileY >= 1 && tileY <= height) {
					heightMap[tileX]![tileY] = 0;
				}
			}
		}
	}

	if (random() < 0.5) {
		const elevX = Math.floor(random() * (width - 4)) + 2;
		const elevY = Math.floor(random() * (height - 4)) + 2;
		const elevW = Math.floor(random() * 4) + 3;
		const elevH = Math.floor(random() * 4) + 3;
		for (let x = elevX; x < elevX + elevW && x <= width; x++) {
			for (let y = elevY; y < elevY + elevH && y <= height; y++) {
				if (heightMap[x]![y]! > 0) {
					heightMap[x]![y] = 2;
				}
			}
		}
	}

	let doorX = 1;
	let doorY = 1;
	for (let x = 1; x <= width; x++) {
		if (heightMap[x]![1]! > 0) {
			doorX = x;
			doorY = 1;
			break;
		}
	}

	return new RoomModel(maxX, maxY, doorX, doorY, heightMap);
}
