// @ts-nocheck — ported from bobba_client AvatarInfo
/* eslint-disable */
export type Direction = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Scale = "l" | "s" | "d" | "n";
export interface FigurePart {
	type: string;
	id: string;
	colors: Array<string>;
}

interface DrawAction {
	body: string;
	wlk?: string;
	sit?: string;
	gesture?: string;
	eye?: string;
	speak?: string;
	itemRight?: string;
	handRight?: string;
	handLeft?: string;
	swm?: string;
}

export default class AvatarInfo {
	direction: Direction;
	headDirection: Direction;
	action: Array<string>;
	gesture: string;
	frame: number;
	isHeadOnly: boolean;
	isBodyOnly: boolean;
	scale: Scale;
	isDownsampled: boolean;
	isLarge: boolean;
	isSmall: boolean;
	rectWidth: number;
	rectHeight: number;
	figure: Array<FigurePart>;
	drawAction: DrawAction;
	handItem: number;
	drawOrder: string;

	constructor(
		figure: string,
		direction: Direction,
		headDirection: Direction,
		action: Array<string>,
		gesture: string,
		frame: number,
		isHeadOnly: boolean,
		isBodyOnly: boolean,
		scale: Scale,
	) {
		this.direction = direction;
		this.headDirection = headDirection;
		this.isHeadOnly = isHeadOnly;
		this.isBodyOnly = isBodyOnly;
		this.scale = scale;
		this.isDownsampled = false;
		this.isLarge = false;
		this.isSmall = false;
		this.rectWidth = 64;
		this.rectHeight = 110;

		switch (scale) {
			case "l":
				this.isLarge = true;
				this.rectWidth = 128;
				this.rectHeight = 220;
				break;
			case "s":
				this.isSmall = true;
				this.rectWidth = 32;
				this.rectHeight = 55;
				break;
			case "d":
				this.isDownsampled = true;
				break;
		}

		this.figure = extractFigureParts(figure);
		this.frame = frame;
		this.drawAction = { body: "std" };
		this.handItem = -1;
		this.drawOrder = "std";
		this.gesture = gesture;

		switch (gesture) {
			case "spk":
				this.drawAction.speak = "spk";
				break;
			case "eyb":
				this.drawAction.eye = "eyb";
				break;
			case "":
				this.drawAction.gesture = "std";
				break;
			default:
				this.drawAction.gesture = gesture;
				break;
		}

		this.action = action;

		for (const value of this.action) {
			const actionParameters = value.split("=");
			switch (actionParameters[0]) {
				case "wlk":
					this.drawAction.wlk = "wlk";
					break;
				case "sit":
					this.drawAction.sit = "sit";
					break;
				case "lay": {
					this.drawAction.body = "lay";
					this.drawAction.eye = "lay";
					const temporary = this.rectWidth;
					this.rectWidth = this.rectHeight;
					this.rectHeight = temporary;
					switch (this.gesture) {
						case "spk":
							this.drawAction.speak = "lsp";
							break;
						case "eyb":
							this.drawAction.eye = "ley";
							break;
						case "std":
							this.drawAction.gesture = "lay";
							break;
						default:
							this.drawAction.gesture =
								"l" + this.gesture.slice(0, 2);
							break;
					}
					break;
				}
				case "wav":
					this.drawAction.handLeft = "wav";
					break;
				case "crr":
				case "drk":
					this.drawAction.handRight = actionParameters[0];
					this.drawAction.itemRight = actionParameters[0];
					this.handItem = Number(actionParameters[1]);
					break;
				case "swm":
					this.drawAction.swm = "swm";
					if (this.gesture === "spk") {
						this.drawAction.speak = "sws";
					}
					break;
				case "":
					this.drawAction.body = "std";
					break;
				default:
					this.drawAction.body = actionParameters[0];
					break;
			}
		}

		if (this.drawAction.sit === "sit") {
			if (this.direction >= 2 && this.direction <= 4) {
				this.drawOrder = "sit";
				if (
					this.drawAction.handRight === "drk" &&
					this.direction >= 2 &&
					this.direction <= 3
				) {
					this.drawOrder += ".rh-up";
				} else if (
					this.drawAction.handLeft &&
					this.direction === 4
				) {
					this.drawOrder += ".lh-up";
				}
			} else if (this.drawAction.body === "lay") {
				this.drawOrder = "lay";
			} else if (
				this.drawAction.handRight === "drk" &&
				this.direction >= 0 &&
				this.direction <= 3
			) {
				this.drawOrder = "rh-up";
			} else if (
				this.drawAction.handLeft &&
				this.direction >= 4 &&
				this.direction <= 6
			) {
				this.drawOrder = "lh-up";
			}
		}
	}
}

export function extractFigureParts(figure: string): Array<FigurePart> {
	const newFigure: { [id: string]: FigurePart } = {};
	const figures: Array<FigurePart> = [];

	for (const part of figure.split(".")) {
		const data = part.split("-");
		const figurePart: FigurePart = {
			type: data[0],
			id: data[1],
			colors: [data[2]],
		};
		if (data[3] != null) {
			figurePart.colors.push(data[3]);
		}
		newFigure[figurePart.type] = figurePart;
	}

	for (const part in newFigure) {
		figures.push(newFigure[part]);
	}
	return figures;
}
