import type { Atlas } from "./Atlas";
import { extractImage } from "./Atlas";
import type { Direction } from "./AvatarInfo";

export default class AvatarChunk {
	lib: string;
	action: string;
	resAction: string;
	type: string;
	resType: string;
	isSmall: boolean;
	partId: number;
	direction: Direction;
	resDirection: number;
	resourceName: string;
	frame: number;
	resFrame: number;
	color: string | null;
	isFlip: boolean;
	promise: Promise<HTMLImageElement> | null;
	resource: HTMLImageElement | null;

	constructor(
		uniqueName: string,
		action: string,
		type: string,
		isSmall: boolean,
		partId: number,
		direction: Direction,
		frame: number,
		color: string,
	) {
		this.resDirection = direction;

		if (type === "hd" && isSmall) partId = 1;
		if (
			type === "ey" &&
			action === "std" &&
			partId === 1 &&
			direction === 3
		)
			action = "sml";
		if (
			type === "fa" &&
			action === "std" &&
			partId === 2 &&
			(direction === 2 || direction === 4)
		)
			this.resDirection = 1;
		if (type === "he" && action === "std" && partId === 1) {
			if (direction === 2) this.resDirection = 0;
		}
		if (type === "he" && action === "std" && partId === 8)
			this.resDirection =
				direction % 2 === 0 ? 1 : this.resDirection;
		if (
			type === "he" &&
			action === "std" &&
			(partId === 2131 || partId === 2132) &&
			direction >= 2 &&
			direction <= 6
		)
			this.resDirection = 1;
		if (type === "ha" && action === "std" && partId === 2518)
			this.resDirection = direction % 2 === 0 ? 2 : 1;
		if (type === "ha" && action === "std" && partId === 2519)
			this.resDirection = direction % 2 === 0 ? 2 : 3;
		if (type === "ha" && action === "std" && partId === 2588)
			this.resDirection = 7;
		if (type === "ha" && action === "std" && partId === 2589)
			this.resDirection = 3;

		this.lib = uniqueName;
		this.isFlip = false;
		this.action = action;
		this.resAction = action;
		this.type = type;
		this.resType = type;
		this.isSmall = isSmall;
		this.partId = partId;
		this.direction = direction;
		this.frame = frame;
		this.resFrame = frame;
		this.color = color;
		this.resourceName = this.getResourceName();
		this.promise = null;
		this.resource = null;
	}

	getResourceName(): string {
		let resourceName = this.isSmall ? "sh" : "h";
		resourceName += "_";
		resourceName += this.resAction;
		resourceName += "_";
		resourceName += this.resType;
		resourceName += "_";
		resourceName += this.partId;
		resourceName += "_";
		resourceName += this.resDirection;
		resourceName += "_";
		resourceName += this.resFrame;
		return resourceName;
	}

	extractFromAtlas(
		atlas: Atlas,
		atlasImg: HTMLImageElement,
	): Promise<HTMLImageElement> | null {
		const img = extractImage(
			atlas,
			atlasImg,
			this.lib + "_" + this.getResourceName() + ".png",
		);
		if (img != null) {
			this.resource = img;
			this.promise = Promise.resolve(img);
		}
		return this.promise;
	}
}
