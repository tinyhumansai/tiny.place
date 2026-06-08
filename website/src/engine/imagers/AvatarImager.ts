// @ts-nocheck — ported from bobba_client AvatarImager, strict index checks deferred
/* eslint-disable */
import AvatarInfo from "./AvatarInfo";
import type { Direction, FigurePart } from "./AvatarInfo";
import AvatarChunk from "./AvatarChunk";
import { SPRITES_BASE_URL } from "../constants";

export default class AvatarImager {
	ready: boolean;
	offsets: Record<string, { promise: Promise<void>; data: any; atlas: any }>;
	chunks: Record<string, AvatarChunk>;
	figuremap: any;
	figuredata: any;
	partsets: any;
	draworder: any;
	animation: any;
	resourcesUrl: string;

	constructor() {
		this.ready = false;
		this.offsets = {};
		this.chunks = {};
		this.figuremap = {};
		this.figuredata = {};
		this.partsets = {};
		this.draworder = {};
		this.animation = {};
		this.resourcesUrl = SPRITES_BASE_URL;
	}

	initialize(): Promise<void> {
		return Promise.all(this.loadFiles()).then(() => {
			this.ready = true;
		});
	}

	loadFiles(): Array<Promise<void>> {
		return [
			this.fetchJsonAsync(this.resourcesUrl + "map.json").then(
				(data) => {
					this.figuremap = data;
				},
			),
			this.fetchJsonAsync(
				this.resourcesUrl + "figuredata.json",
			).then((data) => {
				this.figuredata = data;
			}),
			this.fetchJsonAsync(
				this.resourcesUrl + "partsets.json",
			).then((data) => {
				this.partsets = data;
			}),
			this.fetchJsonAsync(
				this.resourcesUrl + "draworder.json",
			).then((data) => {
				this.draworder = data;
			}),
			this.fetchJsonAsync(
				this.resourcesUrl + "animation.json",
			).then((data) => {
				this.animation = data;
			}),
		];
	}

	fetchJsonAsync(url: string): Promise<any> {
		return fetch(url, { method: "GET", mode: "cors", cache: "default" })
			.then((response) => response.json());
	}

	downloadAtlasAsync(uniqueName: string): Promise<HTMLImageElement> {
		const img = new Image();
		const promise: Promise<HTMLImageElement> = new Promise(
			(resolve, reject) => {
				img.onload = (): void => resolve(img);
				img.onerror = (): void =>
					reject(new Error("Could not load image: " + img.src));
			},
		);
		img.crossOrigin = "anonymous";
		img.src = this.resourcesUrl + uniqueName + "/atlas.png";
		return promise;
	}

	fetchOffsetAsync(uniqueName: string): Promise<void> {
		const offsetPromise = this.fetchJsonAsync(
			this.resourcesUrl + uniqueName + "/offset.json",
		).then((data) => {
			this.offsets[uniqueName].data = data;
		});
		const atlasPromise = this.downloadAtlasAsync(uniqueName).then(
			(data) => {
				this.offsets[uniqueName].atlas = data;
			},
		);
		return Promise.all([offsetPromise, atlasPromise]).then(() => {});
	}

	getChatColor(figure: string): number {
		return this.getTypeColorId(figure, "ch");
	}

	getTypeColorId(figure: string, part: string): number {
		const avatarInfo = new AvatarInfo(
			figure, 0, 0, ["std"], "std", 0, false, false, "d",
		);
		let color = 0x000000;

		for (const figurePart of avatarInfo.figure) {
			if (figurePart.type === part) {
				const parts = this.getPartColor(figurePart);
				for (const type in parts) {
					const partGroup = parts[type];
					for (const particle of partGroup) {
						if (particle.color != null) {
							color = parseInt(particle.color, 16);
							return color;
						}
					}
				}
			}
		}
		return color;
	}

	generateGeneric(
		avatarInfo: AvatarInfo,
		isGhost: boolean,
	): Promise<HTMLCanvasElement> {
		const activeParts: any = {};
		activeParts.rect = this.getActivePartSet(
			avatarInfo.isHeadOnly ? "head" : "figure",
		);
		activeParts.head = this.getActivePartSet("head");
		activeParts.eye = this.getActivePartSet("eye");
		activeParts.gesture = this.getActivePartSet("gesture");
		activeParts.speak = this.getActivePartSet("speak");
		activeParts.walk = this.getActivePartSet("walk");
		activeParts.sit = this.getActivePartSet("sit");
		activeParts.itemRight = this.getActivePartSet("itemRight");
		activeParts.handRight = this.getActivePartSet("handRight");
		activeParts.handLeft = this.getActivePartSet("handLeft");
		activeParts.swim = this.getActivePartSet("swim");

		let drawParts = this.getDrawOrder(
			avatarInfo.drawOrder,
			avatarInfo.direction,
		);
		if (drawParts == null) {
			drawParts = this.getDrawOrder("std", avatarInfo.direction);
		}

		const setParts: any = {};
		for (const partSet of avatarInfo.figure) {
			const parts = this.getPartColor(partSet);
			for (const type in parts) {
				if (setParts[type] == null) setParts[type] = [];
				setParts[type] = parts[type].concat(setParts[type]);
			}
		}

		if (avatarInfo.handItem > 0) {
			setParts["ri"] = [{ index: 0, id: avatarInfo.handItem }];
		}

		const chunks: Array<AvatarChunk> = [];
		const offsetsPromises: Array<Promise<void>> = [];

		for (const type of drawParts) {
			const drawableParts = setParts[type];
			if (drawableParts != null) {
				for (const drawablePart of drawableParts) {
					const uniqueName = this.getPartUniqueName(
						type,
						drawablePart["id"],
					);
					if (uniqueName != null) {
						if (setParts["hidden"].includes(type)) continue;
						if (
							activeParts.head.includes(type) &&
							avatarInfo.isBodyOnly
						)
							continue;
						if (!activeParts.rect.includes(type)) continue;
						if (
							isGhost &&
							(activeParts.gesture.includes(type) ||
								activeParts.eye.includes(type))
						)
							continue;

						let drawDirection = avatarInfo.direction;
						let drawAction: string | null = null;

						if (activeParts.rect.includes(type))
							drawAction = avatarInfo.drawAction.body;
						if (activeParts.head.includes(type))
							drawDirection = avatarInfo.headDirection;
						if (
							activeParts.speak.includes(type) &&
							avatarInfo.drawAction.speak
						)
							drawAction = avatarInfo.drawAction.speak;
						if (
							activeParts.gesture.includes(type) &&
							avatarInfo.drawAction.gesture
						)
							drawAction = avatarInfo.drawAction.gesture;
						if (activeParts.eye.includes(type)) {
							drawablePart.colorable = false;
							if (avatarInfo.drawAction.eye)
								drawAction = avatarInfo.drawAction.eye;
						}
						if (
							activeParts.walk.includes(type) &&
							avatarInfo.drawAction.wlk
						)
							drawAction = avatarInfo.drawAction.wlk;
						if (
							activeParts.sit.includes(type) &&
							avatarInfo.drawAction.sit
						)
							drawAction = avatarInfo.drawAction.sit;
						if (
							activeParts.handRight.includes(type) &&
							avatarInfo.drawAction.handRight
						)
							drawAction = avatarInfo.drawAction.handRight;
						if (
							activeParts.itemRight.includes(type) &&
							avatarInfo.drawAction.itemRight
						)
							drawAction = avatarInfo.drawAction.itemRight;
						if (
							activeParts.handLeft.includes(type) &&
							avatarInfo.drawAction.handLeft
						)
							drawAction = avatarInfo.drawAction.handLeft;
						if (
							activeParts.swim.includes(type) &&
							avatarInfo.drawAction.swm
						)
							drawAction = avatarInfo.drawAction.swm;

						if (drawAction == null) continue;

						if (this.offsets[uniqueName] == null) {
							this.offsets[uniqueName] = {
								promise: this.fetchOffsetAsync(uniqueName),
								data: {},
								atlas: {},
							};
						}
						offsetsPromises.push(
							this.offsets[uniqueName].promise,
						);

						const color = drawablePart.colorable
							? drawablePart.color
							: null;
						const drawPartChunk = this.getPartResource(
							uniqueName,
							drawAction,
							type,
							avatarInfo.isSmall,
							drawablePart["id"],
							drawDirection,
							avatarInfo.frame,
							color,
						);
						chunks.push(drawPartChunk);
					}
				}
			}
		}

		return new Promise((resolve, reject) => {
			Promise.all(offsetsPromises).then(() => {
				const tempCanvas = document.createElement("canvas");
				const tempContext = tempCanvas.getContext("2d");
				tempCanvas.width = avatarInfo.rectWidth;
				tempCanvas.height = avatarInfo.rectHeight;

				const chunksPromises: Array<
					Promise<HTMLImageElement> | null
				> = [];

				for (const chunk of chunks) {
					if (
						this.offsets[chunk.lib].data != null &&
						this.offsets[chunk.lib].data[
							chunk.getResourceName()
						] != null &&
						!this.offsets[chunk.lib].data[
							chunk.getResourceName()
						].flipped
					) {
						const atlasData =
							this.offsets[chunk.lib].data.atlas;
						const atlasImg = this.offsets[chunk.lib].atlas;
						chunksPromises.push(
							chunk.extractFromAtlas(atlasData, atlasImg),
						);
					} else {
						const flippedType =
							this.partsets.partSet[chunk.type][
								"flipped-set-type"
							];
						if (flippedType !== "") {
							chunk.resType = flippedType;
						}
						if (
							chunk.action === "std" &&
							(this.offsets[chunk.lib].data == null ||
								this.offsets[chunk.lib].data[
									chunk.getResourceName()
								] == null ||
								this.offsets[chunk.lib].data[
									chunk.getResourceName()
								].flipped)
						) {
							chunk.resAction = "spk";
						}
						if (
							this.offsets[chunk.lib].data == null ||
							this.offsets[chunk.lib].data[
								chunk.getResourceName()
							] == null ||
							this.offsets[chunk.lib].data[
								chunk.getResourceName()
							].flipped
						) {
							chunk.isFlip = true;
							chunk.resAction = chunk.action;
							chunk.resDirection = 6 - chunk.direction;
						}
						if (
							this.offsets[chunk.lib].data == null ||
							this.offsets[chunk.lib].data[
								chunk.getResourceName()
							] == null ||
							this.offsets[chunk.lib].data[
								chunk.getResourceName()
							].flipped
						) {
							chunk.resFrame = chunk.frame + 1;
							chunk.isFlip = false;
						}
						if (
							this.offsets[chunk.lib].data == null ||
							this.offsets[chunk.lib].data[
								chunk.getResourceName()
							] == null ||
							this.offsets[chunk.lib].data[
								chunk.getResourceName()
							].flipped
						) {
							chunk.isFlip = false;
							chunk.resFrame = chunk.frame;
							chunk.resAction = chunk.action;
							if (chunk.direction === 7)
								chunk.resDirection = 3;
							if (chunk.direction === 3)
								chunk.resDirection = 7;
						}
						if (
							this.offsets[chunk.lib].data == null ||
							this.offsets[chunk.lib].data[
								chunk.getResourceName()
							] == null ||
							this.offsets[chunk.lib].data[
								chunk.getResourceName()
							].flipped
						) {
							chunk.resFrame = chunk.frame + 1;
							chunk.isFlip = false;
						}
						if (
							this.offsets[chunk.lib].data == null ||
							this.offsets[chunk.lib].data[
								chunk.getResourceName()
							] == null ||
							this.offsets[chunk.lib].data[
								chunk.getResourceName()
							].flipped
						) {
							chunk.resAction = chunk.action;
							chunk.resType = flippedType;
							chunk.resDirection = chunk.direction;
						}
						if (
							chunk.action === "std" &&
							(this.offsets[chunk.lib].data == null ||
								this.offsets[chunk.lib].data[
									chunk.getResourceName()
								] == null ||
								this.offsets[chunk.lib].data[
									chunk.getResourceName()
								].flipped)
						) {
							chunk.resAction = "spk";
							chunk.resType = chunk.type;
						}
						if (
							this.offsets[chunk.lib].data != null &&
							this.offsets[chunk.lib].data[
								chunk.getResourceName()
							] != null &&
							!this.offsets[chunk.lib].data[
								chunk.getResourceName()
							].flipped
						) {
							const atlasData =
								this.offsets[chunk.lib].data.atlas;
							const atlasImg =
								this.offsets[chunk.lib].atlas;
							chunksPromises.push(
								chunk.extractFromAtlas(
									atlasData,
									atlasImg,
								),
							);
						}
					}
				}

				Promise.all(
					chunksPromises.filter(
						(p): p is Promise<HTMLImageElement> => p != null,
					),
				)
					.catch(() => {
						reject(new Error("Error downloading chunks"));
					})
					.then(() => {
						for (const chunk of chunks) {
							if (
								this.offsets[chunk.lib].data != null &&
								this.offsets[chunk.lib].data[
									chunk.getResourceName()
								] != null
							) {
								if (chunk.resource != null) {
									let positionX =
										-this.offsets[chunk.lib].data[
											chunk.getResourceName()
										].x;
									const positionY =
										avatarInfo.rectHeight / 2 -
										this.offsets[chunk.lib].data[
											chunk.getResourceName()
										].y +
										avatarInfo.rectHeight / 2.5;

									let img:
										| HTMLCanvasElement
										| HTMLImageElement
										| null = chunk.resource;
									if (chunk.color != null) {
										img = tintSprite(
											img,
											chunk.color,
											isGhost ? 170 : 255,
										);
									}
									if (img != null && chunk.isFlip) {
										positionX = -(
											positionX +
											img.width -
											avatarInfo.rectWidth +
											1
										);
										img = flipImageCanvas(img);
									}
									if (tempContext != null && img != null) {
										tempContext.drawImage(
											img,
											positionX,
											positionY,
										);
									}
								}
							}
						}

						let result: HTMLCanvasElement = tempCanvas;
						if (avatarInfo.isDownsampled) {
							const downsampled =
								downsampleImage(tempCanvas);
							if (downsampled != null) result = downsampled;
						}

						resolve(result);
					});
			});
		});
	}

	getActivePartSet(partSet: string): any {
		const activeParts =
			this.partsets["activePartSet"][partSet]["activePart"];
		if (activeParts == null || activeParts.length === 0) return null;
		return activeParts;
	}

	getDrawOrder(action: string, direction: Direction): any {
		const drawOrder = this.draworder[action]?.[direction];
		if (drawOrder == null || drawOrder.length === 0) return null;
		return drawOrder;
	}

	getPartColor(figure: FigurePart): any {
		const parts: any = {};
		const partSet = this.figuredata["settype"][figure.type];
		if (partSet != null) {
			if (
				partSet["set"][figure.id] != null &&
				partSet["set"][figure.id]["part"] != null
			) {
				for (const rawPart of partSet["set"][figure.id]["part"]) {
					const part: any = rawPart;
					const element: any = {
						index: part.index,
						id: part.id,
						colorable: part.colorable,
					};
					if (part.colorable) {
						element.color = this.getColorByPaletteId(
							partSet.paletteid,
							figure.colors[part.colorindex - 1],
						);
					}
					if (parts[part.type] == null) {
						parts[part.type] = [element];
					} else {
						parts[part.type].push(element);
					}
				}
			}
			parts.hidden = [];
			if (
				partSet["set"][figure.id] != null &&
				Array.isArray(partSet["set"][figure.id]["hidden"])
			) {
				for (const partType of partSet["set"][figure.id][
					"hidden"
				]) {
					parts.hidden.push(partType);
				}
			}
		}
		return parts;
	}

	getColorByPaletteId(paletteId: string, colorId: string): any {
		if (
			this.figuredata["palette"][paletteId] != null &&
			this.figuredata["palette"][paletteId][colorId] != null &&
			this.figuredata["palette"][paletteId][colorId]["color"] != null
		) {
			return this.figuredata["palette"][paletteId][colorId]["color"];
		}
		return null;
	}

	getPartUniqueName(type: string, partId: number): string {
		let uniqueName = this.figuremap[type]?.[partId];
		if (uniqueName == null && type === "hrb") {
			uniqueName = this.figuremap["hr"]?.[partId];
		}
		if (uniqueName == null) uniqueName = this.figuremap[type]?.[1];
		if (uniqueName == null) uniqueName = this.figuremap[type]?.[0];
		return uniqueName;
	}

	getPartResource(
		uniqueName: string,
		action: string,
		type: string,
		isSmall: boolean,
		partId: number,
		direction: Direction,
		frame: number,
		color: string,
	): AvatarChunk {
		const partFrame = this.getFrameNumber(type, action, frame);
		const chunk = new AvatarChunk(
			uniqueName,
			action,
			type,
			isSmall,
			partId,
			direction,
			partFrame,
			color,
		);
		const resourceName = chunk.getResourceName();
		if (
			this.chunks[resourceName] != null &&
			this.chunks[resourceName].resource != null
		) {
			chunk.resource = this.chunks[resourceName].resource;
			chunk.promise = this.chunks[resourceName].promise;
		} else {
			this.chunks[resourceName] = chunk;
		}
		return chunk;
	}

	getFrameNumber(type: string, action: string, frame: number): number {
		const translations: any = {
			wav: "Wave",
			wlk: "Move",
			spk: "Talk",
		};
		if (translations[action] != null) {
			if (
				this.animation[translations[action]].part[type] != null
			) {
				const count =
					this.animation[translations[action]].part[type]
						.length;
				if (
					this.animation[translations[action]].part[type][
						frame % count
					] != null
				) {
					return this.animation[translations[action]].part[
						type
					][frame % count].number;
				}
			}
		}
		return 0;
	}
}

function hex2rgb(
	hex: string,
): { r: number; g: number; b: number } | null {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return result
		? {
				r: parseInt(result[1], 16),
				g: parseInt(result[2], 16),
				b: parseInt(result[3], 16),
			}
		: null;
}

function tintSprite(
	img: HTMLCanvasElement | HTMLImageElement,
	color: string,
	alpha: number,
): HTMLCanvasElement | null {
	const element = document.createElement("canvas");
	const context = element.getContext("2d");
	if (context == null) return null;

	const rgb = hex2rgb(color);
	if (rgb == null) return null;

	const { width, height } = img;
	element.width = width;
	element.height = height;

	context.drawImage(img, 0, 0);
	const imageData = context.getImageData(0, 0, width, height);
	for (let y = 0; y < height; y++) {
		let position = y * width * 4;
		for (let x = 0; x < width; x++) {
			position++;
			position++;
			position++;
			const pa = imageData.data[position++];
			if (pa !== 0) {
				imageData.data[position - 1] = alpha;
				imageData.data[position - 2] = Math.round(
					(rgb.b * imageData.data[position - 2]) / 255,
				);
				imageData.data[position - 3] = Math.round(
					(rgb.g * imageData.data[position - 3]) / 255,
				);
				imageData.data[position - 4] = Math.round(
					(rgb.r * imageData.data[position - 4]) / 255,
				);
			}
		}
	}
	context.putImageData(imageData, 0, 0);
	return element;
}

function flipImageCanvas(
	img: HTMLCanvasElement | HTMLImageElement,
): HTMLCanvasElement | null {
	const element = document.createElement("canvas");
	const context = element.getContext("2d");
	if (context == null) return null;

	const { width, height } = img;
	element.width = width;
	element.height = height;

	context.save();
	context.scale(-1, 1);
	context.drawImage(img, 0, 0, width * -1, height);
	context.restore();

	return element;
}

function downsampleImage(
	img: HTMLCanvasElement | HTMLImageElement,
): HTMLCanvasElement | null {
	const element = document.createElement("canvas");
	const context = element.getContext("2d");
	if (context == null) return null;

	const { width, height } = img;
	element.width = width;
	element.height = height;

	context.save();
	context.scale(0.5, 0.5);
	context.drawImage(img, 0, 0);
	context.restore();

	return element;
}

export function generateSilhouette(
	img: HTMLImageElement | HTMLCanvasElement,
	r: number,
	g: number,
	b: number,
): HTMLCanvasElement | HTMLImageElement {
	const element = document.createElement("canvas");
	const context = element.getContext("2d");
	const { width, height } = img;

	if (context == null || width === 0 || height === 0) return img;

	element.width = width;
	element.height = height;

	context.drawImage(img, 0, 0);
	const imageData = context.getImageData(0, 0, width, height);

	for (let y = 0; y < height; y++) {
		let position = y * width * 4;
		for (let x = 0; x < width; x++) {
			position += 3;
			const pa = imageData.data[position++];
			if (pa !== 0) {
				imageData.data[position - 1] = 255;
				imageData.data[position - 2] = b;
				imageData.data[position - 3] = g;
				imageData.data[position - 4] = r;
			}
		}
	}
	context.putImageData(imageData, 0, 0);
	return element;
}
