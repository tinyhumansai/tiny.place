import type { RoomFurnitureLayout } from "./types";

const POKER_ROOM_LAYOUT: RoomFurnitureLayout = {
	roomType: "poker",
	items: [
		{ itemType: "poker_table", tileX: 5.5, tileY: 5.5, tileZ: 2, offsetY: -20 },

		{ itemType: "chip_stack_red", tileX: 5.0, tileY: 4.8, tileZ: 2, offsetY: -34 },
		{ itemType: "chip_stack_blue", tileX: 6.0, tileY: 5.0, tileZ: 2, offsetY: -36 },
		{ itemType: "chip_stack_green", tileX: 5.2, tileY: 6.2, tileZ: 2, offsetY: -30 },
		{ itemType: "chip_stack_black", tileX: 6.2, tileY: 6.0, tileZ: 2, offsetY: -34 },

		{ itemType: "card_facedown", tileX: 5.0, tileY: 5.3, tileZ: 2, offsetY: -32, offsetX: -4 },
		{ itemType: "card_facedown", tileX: 5.8, tileY: 5.5, tileZ: 2, offsetY: -34, offsetX: 6 },
		{ itemType: "card_facedown", tileX: 5.4, tileY: 5.8, tileZ: 2, offsetY: -30, offsetX: 2 },
		{ itemType: "card_facedown", tileX: 6.0, tileY: 4.8, tileZ: 2, offsetY: -36, offsetX: -2 },
		{ itemType: "card_facedown", tileX: 5.5, tileY: 5.1, tileZ: 2, offsetY: -34, offsetX: 0 },

		{ itemType: "dealer_chip", tileX: 5.5, tileY: 4.5, tileZ: 2, offsetY: -30 },
	],
};

export const FURNITURE_LAYOUTS: Record<string, RoomFurnitureLayout> = {
	poker: POKER_ROOM_LAYOUT,
};
