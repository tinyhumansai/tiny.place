import type { RoomFurnitureLayout } from "./types";

const POKER_ROOM_LAYOUT: RoomFurnitureLayout = {
	roomType: "poker",
	items: [
		{ itemType: "poker_table", tileX: 6, tileY: 7, tileZ: 2, offsetY: -20 },

		{ itemType: "dealer_chip", tileX: 5.2, tileY: 6.0, tileZ: 2, offsetY: -30 },

		{ itemType: "chip_stack_red", tileX: 5.5, tileY: 6.5, tileZ: 2, offsetY: -34 },
		{ itemType: "chip_stack_blue", tileX: 6.5, tileY: 6.8, tileZ: 2, offsetY: -36 },
		{ itemType: "chip_stack_green", tileX: 5.8, tileY: 7.5, tileZ: 2, offsetY: -30 },
		{ itemType: "chip_stack_black", tileX: 6.5, tileY: 7.5, tileZ: 2, offsetY: -34 },

		{ itemType: "card_facedown", tileX: 5.5, tileY: 7.0, tileZ: 2, offsetY: -32, offsetX: -4 },
		{ itemType: "card_facedown", tileX: 6.3, tileY: 7.2, tileZ: 2, offsetY: -34, offsetX: 6 },
		{ itemType: "card_facedown", tileX: 6.0, tileY: 7.5, tileZ: 2, offsetY: -30, offsetX: 2 },

		// Dealer chair — top-left short end
		{ itemType: "chair", tileX: 4.5, tileY: 5.5, tileZ: 2, offsetY: -10 },

		// Left side — 3 chairs
		{ itemType: "chair", tileX: 4.5, tileY: 6.5, tileZ: 2, offsetY: -10 },
		{ itemType: "chair", tileX: 4.5, tileY: 7.5, tileZ: 2, offsetY: -10 },
		{ itemType: "chair", tileX: 4.5, tileY: 8.5, tileZ: 2, offsetY: -10 },

		// Right side — 3 chairs
		{ itemType: "chair", tileX: 7.5, tileY: 6.5, tileZ: 2, offsetY: -10 },
		{ itemType: "chair", tileX: 7.5, tileY: 7.5, tileZ: 2, offsetY: -10 },
		{ itemType: "chair", tileX: 7.5, tileY: 8.5, tileZ: 2, offsetY: -10 },

		// Bottom short end — 2 chairs
		{ itemType: "chair", tileX: 5.5, tileY: 9.0, tileZ: 2, offsetY: -10 },
		{ itemType: "chair", tileX: 6.5, tileY: 9.0, tileZ: 2, offsetY: -10 },
	],
};

export const FURNITURE_LAYOUTS: Record<string, RoomFurnitureLayout> = {
	poker: POKER_ROOM_LAYOUT,
};
