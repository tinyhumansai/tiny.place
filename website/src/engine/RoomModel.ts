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
		endY: number
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
		const queue: Array<{ x: number; y: number; path: Array<{ x: number; y: number }> }> = [];
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
