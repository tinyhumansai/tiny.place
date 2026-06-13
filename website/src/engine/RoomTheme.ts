export interface RoomTheme {
	id: string;
	backgroundColor: string;
	floor: {
		top: string;
		topStroke: string;
		leftSide: string;
		leftStroke: string;
		rightSide: string;
		rightStroke: string;
	};
	wall: {
		top: string;
		leftFace: string;
		rightFace: string;
		rightFaceAlt: string;
	};
}

export const DEFAULT_THEME: RoomTheme = {
	id: "default",
	backgroundColor: "#1a1a2e",
	floor: {
		top: "#989865",
		topStroke: "rgba(142,142,94,127)",
		leftSide: "#838357",
		leftStroke: "#7A7A51",
		rightSide: "#6F6F49",
		rightStroke: "#676744",
	},
	wall: {
		top: "#70727a",
		leftFace: "#bbbecd",
		rightFace: "#90929e",
		rightFaceAlt: "#b6b9c8",
	},
};

export const CHAT_THEME: RoomTheme = {
	id: "chat",
	backgroundColor: "#141822",
	floor: {
		top: "#7a8a9a",
		topStroke: "rgba(100,120,140,180)",
		leftSide: "#6a7a8a",
		leftStroke: "#5c6c7c",
		rightSide: "#546474",
		rightStroke: "#4c5c6c",
	},
	wall: {
		top: "#606878",
		leftFace: "#a0a8b8",
		rightFace: "#808898",
		rightFaceAlt: "#96a0b0",
	},
};

export const POKER_THEME: RoomTheme = {
	id: "poker",
	backgroundColor: "#0d1b0f",
	floor: {
		top: "#2d6a4f",
		topStroke: "rgba(35,90,65,180)",
		leftSide: "#245c43",
		leftStroke: "#1b4d37",
		rightSide: "#1a4030",
		rightStroke: "#153528",
	},
	wall: {
		top: "#4a3728",
		leftFace: "#8b6f47",
		rightFace: "#6b5335",
		rightFaceAlt: "#7d6040",
	},
};

export const COURT_THEME: RoomTheme = {
	id: "court",
	backgroundColor: "#1a1520",
	floor: {
		top: "#d4cfc4",
		topStroke: "rgba(180,175,165,180)",
		leftSide: "#b8b3a8",
		leftStroke: "#a09b90",
		rightSide: "#9c9788",
		rightStroke: "#8e897a",
	},
	wall: {
		top: "#3d2b1f",
		leftFace: "#6b4c35",
		rightFace: "#553d2a",
		rightFaceAlt: "#604530",
	},
};

export const MARKETPLACE_THEME: RoomTheme = {
	id: "marketplace",
	backgroundColor: "#1e1510",
	floor: {
		top: "#c4894d",
		topStroke: "rgba(170,120,60,180)",
		leftSide: "#a87340",
		leftStroke: "#946338",
		rightSide: "#8a5b32",
		rightStroke: "#7a502c",
	},
	wall: {
		top: "#d4b896",
		leftFace: "#e8d5b8",
		rightFace: "#c8a878",
		rightFaceAlt: "#dcc8a0",
	},
};

export const LEADERBOARD_THEME: RoomTheme = {
	id: "leaderboard",
	backgroundColor: "#12101a",
	floor: {
		top: "#c9a84c",
		topStroke: "rgba(180,150,60,180)",
		leftSide: "#b08f3f",
		leftStroke: "#9a7d35",
		rightSide: "#8a6f2e",
		rightStroke: "#7a6228",
	},
	wall: {
		top: "#3a3a4a",
		leftFace: "#5a5a6e",
		rightFace: "#484858",
		rightFaceAlt: "#525264",
	},
};
