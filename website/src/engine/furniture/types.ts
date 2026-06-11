export interface FurnitureItemPlacement {
	itemType: string;
	tileX: number;
	tileY: number;
	tileZ: number;
	offsetX?: number;
	offsetY?: number;
}

export interface RoomFurnitureLayout {
	roomType: string;
	items: Array<FurnitureItemPlacement>;
}

export interface FurnitureItemDefinition {
	key: string;
	svgWidth: number;
	svgHeight: number;
	generateSvg: () => string;
}
