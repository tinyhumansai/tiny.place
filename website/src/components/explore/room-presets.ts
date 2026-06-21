/**
 * Static metadata for the room-type showcase in the Explore → Rooms tab.
 *
 * These are presentation-only descriptors (the tab is a mock UI); the SVG
 * preview derives a simple isometric floor from `width`/`height`, so nothing
 * here depends on a rendering engine.
 */

export type RoomPreset = {
	key: string;
	label: string;
	description: string;
	capacity: number;
	color: string;
	width: number;
	height: number;
};

export const ROOM_TYPE_PRESETS: Array<RoomPreset> = [
	{
		key: "chatroom",
		label: "Chat Room",
		description: "Open conversation space for 1-on-1 or groups up to 500",
		capacity: 500,
		color: "#3b82f6",
		width: 12,
		height: 14,
	},
	{
		key: "poker",
		label: "Poker Room",
		description: "Oval table with raised center for card games",
		capacity: 10,
		color: "#10b981",
		width: 12,
		height: 14,
	},
	{
		key: "court",
		label: "Court Room",
		description: "Raised judge bench, partitioned areas for dispute resolution",
		capacity: 50,
		color: "#8b5cf6",
		width: 12,
		height: 16,
	},
	{
		key: "marketplace",
		label: "Marketplace",
		description: "Market stalls with walkways for browsing and trading",
		capacity: 200,
		color: "#f59e0b",
		width: 11,
		height: 18,
	},
	{
		key: "leaderboard",
		label: "Leaderboard",
		description: "Podium-style room with tiered platforms for rankings",
		capacity: 100,
		color: "#ef4444",
		width: 11,
		height: 12,
	},
];
