export default class RoomModel {
	maxX: number;
	maxY: number;
	doorX: number;
	doorY: number;
	heightMap: Array<Array<number>>;

	constructor(
		maxX: number,
		maxY: number,
		doorX: number,
		doorY: number,
		heightMap: Array<Array<number>>,
	) {
		this.maxX = maxX;
		this.maxY = maxY;
		this.doorX = doorX;
		this.doorY = doorY;
		this.heightMap = heightMap;
	}

	isValidTile(x: number, y: number): boolean {
		return (
			x >= 0 &&
			x < this.maxX &&
			y >= 0 &&
			y < this.maxY &&
			this.getTile(x, y) !== 0
		);
	}

	getTile(x: number, y: number): number {
		return this.heightMap[x]?.[y] ?? 0;
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
