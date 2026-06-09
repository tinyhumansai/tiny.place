const FURNI_CDN_URL = "https://images.bobba.io/dcr/hof_furni/";

type FurniDirection = 0 | 2 | 4 | 6;

interface FurniOffsetAsset {
	name: string;
	exists: boolean;
	x: number;
	y: number;
	flipH?: number;
	source?: string;
}

interface FurniVisualizationLayer {
	layerId: number;
	ink?: string;
	alpha?: number;
	ignoreMouse?: number;
	z?: number;
}

interface FurniAnimationLayer {
	layerId: number;
	frameSequence: Array<Array<number>>;
}

interface FurniAnimation {
	id: number;
	transitionTo?: number;
	layers: Array<FurniAnimationLayer>;
}

interface FurniVisualization {
	angle: number;
	layerCount: number;
	size: number;
	directions: Record<number, Array<FurniVisualizationLayer>>;
	layers?: Array<FurniVisualizationLayer>;
	colors?: Record<string, Array<{ layerId: number; color: string }>>;
	animations?: Record<number, FurniAnimation>;
}

interface AtlasFrame {
	frame: { x: number; y: number; w: number; h: number };
	rotated: boolean;
	trimmed: boolean;
	spriteSourceSize: { x: number; y: number; w: number; h: number };
	sourceSize: { w: number; h: number };
	pivot: { x: number; y: number };
}

interface FurniOffset {
	assets: Record<string, FurniOffsetAsset>;
	visualization: { 1: FurniVisualization; 64: FurniVisualization };
	logic: {
		dimensions: { x: number; y: number; z: number };
		directions: Array<number>;
	};
	index: { type: string; visualization: string; logic: string };
	atlas: { frames: Record<string, AtlasFrame>; meta: unknown };
}

export interface RoomItemDescription {
	id: number;
	classname: string;
	name: string;
	description: string;
	revision: number;
	canstandon: number;
	cansiton: number;
	canlayon: number;
	xdim: number;
	ydim: number;
}

interface Furnidata {
	roomitemtypes: Record<number, RoomItemDescription>;
	wallitemtypes: Record<number, unknown>;
}

interface FurniLayer {
	asset: { image: HTMLCanvasElement; x: number; y: number; isFlipped: boolean };
	alpha?: number;
	color?: number;
	ink?: string;
}

export interface FurniTexture {
	canvas: HTMLCanvasElement;
	offsetX: number;
	offsetY: number;
}

export interface LoadedFurniture {
	itemId: number;
	itemData: RoomItemDescription;
	textures: Record<string, FurniTexture>;
	directions: Array<FurniDirection>;
	stateCount: number;
	seatHeight: number;
}

export default class FurniImager {
	private furnidata: Furnidata | null = null;
	private readonly cache: Map<string, Promise<LoadedFurniture>> = new Map();

	public async initialize(): Promise<void> {
		const response = await fetch(`${FURNI_CDN_URL}furnidata.json`, {
			mode: "cors",
			cache: "default",
		});
		this.furnidata = (await response.json()) as Furnidata;
	}

	public findItemById(itemId: number): RoomItemDescription | null {
		if (!this.furnidata) return null;
		return this.furnidata.roomitemtypes[itemId] ?? null;
	}

	public async loadFurniture(itemId: number): Promise<LoadedFurniture> {
		const key = String(itemId);
		const existing = this.cache.get(key);
		if (existing) return existing;

		const promise = this._loadFurniture(itemId);
		this.cache.set(key, promise);
		return promise;
	}

	private async _loadFurniture(itemId: number): Promise<LoadedFurniture> {
		const itemData = this.findItemById(itemId);
		if (!itemData) throw new Error(`Unknown furniture id ${itemId}`);

		const rawName = itemData.classname;
		const itemName = rawName.includes("*") ? rawName.split("*")[0]! : rawName;
		const colorId = rawName.includes("*")
			? Number.parseInt(rawName.split("*")[1]!, 10)
			: 0;

		const offsetResponse = await fetch(
			`${FURNI_CDN_URL}${itemName}/furni.json`,
			{ mode: "cors" }
		);
		const offset = (await offsetResponse.json()) as FurniOffset;

		const atlasImage = await this._loadImage(
			`${FURNI_CDN_URL}${itemName}/atlas.png`
		);

		const spriteImages = this._extractSprites(offset, atlasImage);

		const visualization = offset.visualization[64];
		const directions = Object.keys(visualization.directions).map(
			(d) => Number.parseInt(d, 10) as FurniDirection
		);

		let stateCount = 1;
		if (visualization.animations) {
			stateCount = Object.keys(visualization.animations).length + 1;
		}

		const textures: Record<string, FurniTexture> = {};

		const maxFrames = this._getMaxFrames(visualization);
		for (const direction of directions) {
			for (let state = 0; state < stateCount; state++) {
				for (let frame = 0; frame <= maxFrames; frame++) {
					const textureKey = `${direction}_${state}_${frame}`;
					const rendered = this._renderFrame(
						offset,
						spriteImages,
						itemName,
						colorId,
						visualization,
						direction,
						state,
						frame
					);
					if (rendered) {
						textures[textureKey] = rendered;
					}
				}
			}
		}

		const seatHeight = offset.logic.dimensions.z ?? 0;

		return { itemId, itemData, textures, directions, stateCount, seatHeight };
	}

	private _extractSprites(
		offset: FurniOffset,
		atlasImage: HTMLImageElement
	): Record<string, HTMLCanvasElement> {
		const sprites: Record<string, HTMLCanvasElement> = {};
		for (const frameKey of Object.keys(offset.atlas.frames)) {
			const frameData = offset.atlas.frames[frameKey]!;
			const { x, y, w, h } = frameData.frame;
			const canvas = document.createElement("canvas");
			canvas.width = w;
			canvas.height = h;
			const context = canvas.getContext("2d");
			if (context) {
				context.drawImage(atlasImage, x, y, w, h, 0, 0, w, h);
				sprites[frameKey] = canvas;
			}
		}
		return sprites;
	}

	private _getMaxFrames(visualization: FurniVisualization): number {
		if (!visualization.animations) return 0;
		let max = 0;
		for (const animation of Object.values(visualization.animations)) {
			for (const layer of animation.layers) {
				if (layer.frameSequence) {
					for (const sequence of layer.frameSequence) {
						if (sequence.length > max) max = sequence.length;
					}
				}
			}
		}
		return Math.min(max, 8);
	}

	private _renderFrame(
		offset: FurniOffset,
		sprites: Record<string, HTMLCanvasElement>,
		itemName: string,
		colorId: number,
		visualization: FurniVisualization,
		direction: FurniDirection,
		state: number,
		frame: number
	): FurniTexture | null {
		const layers = this._getLayers(
			offset,
			sprites,
			itemName,
			colorId,
			visualization,
			direction,
			state,
			frame
		);
		if (layers.length === 0) return null;

		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;

		for (const layer of layers) {
			const posX = -layer.asset.x;
			const posY = -layer.asset.y;
			const image = layer.asset.image;
			if (posX < minX) minX = posX;
			if (posY < minY) minY = posY;
			if (posX + image.width > maxX) maxX = posX + image.width;
			if (posY + image.height > maxY) maxY = posY + image.height;

			if (layer.asset.isFlipped) {
				const flippedX = layer.asset.x - image.width;
				if (flippedX < minX) minX = flippedX;
			}
		}

		const width = maxX - minX;
		const height = maxY - minY;
		if (width <= 0 || height <= 0) return null;

		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext("2d");
		if (!context) return null;

		for (const layer of layers) {
			let posX = -minX - layer.asset.x;
			const posY = -minY - layer.asset.y;
			let image: HTMLCanvasElement = layer.asset.image;

			if (layer.asset.isFlipped) {
				const flipped = this._flipImage(image);
				if (flipped) {
					posX = layer.asset.x - image.width - minX;
					image = flipped;
				}
			}

			if (layer.ink === "ADD") {
				context.globalCompositeOperation = "lighter";
			} else {
				context.globalCompositeOperation = "source-over";
			}

			if (layer.alpha !== undefined) {
				const tinted = this._tintSprite(image, 0xffffff, layer.alpha);
				if (tinted) image = tinted;
			}

			if (layer.color !== undefined) {
				const tinted = this._tintSprite(image, layer.color, 255);
				if (tinted) image = tinted;
			}

			context.drawImage(image, posX, posY);
		}

		return { canvas, offsetX: minX, offsetY: minY };
	}

	private _getLayers(
		offset: FurniOffset,
		sprites: Record<string, HTMLCanvasElement>,
		itemName: string,
		colorId: number,
		visualization: FurniVisualization,
		direction: FurniDirection,
		state: number,
		frame: number
	): Array<FurniLayer> {
		const chunks: Array<FurniLayer> = [];

		for (
			let layerIndex = -1;
			layerIndex < visualization.layerCount;
			layerIndex++
		) {
			let alpha: number | undefined;
			let ink: string | undefined;
			let color: number | undefined;
			let layerFrame = 0;

			if (layerIndex === -1) alpha = 77;

			if (visualization.layers) {
				for (const layer of visualization.layers) {
					if (layer.layerId === layerIndex) {
						if (layer.ink) ink = layer.ink;
						if (layer.alpha !== undefined) alpha = layer.alpha;
					}
				}
			}

			if (visualization.colors?.[colorId]) {
				for (const colorLayer of visualization.colors[colorId]) {
					if (colorLayer.layerId === layerIndex) {
						color = Number.parseInt(colorLayer.color, 16);
					}
				}
			}

			if (visualization.animations?.[state]) {
				for (const animLayer of visualization.animations[state].layers) {
					if (
						animLayer.layerId === layerIndex &&
						animLayer.frameSequence?.length > 0
					) {
						const sequence = animLayer.frameSequence[0]!;
						layerFrame = sequence[frame % sequence.length]!;
					}
				}
			}

			const layerName =
				layerIndex === -1 ? "sd" : String.fromCharCode(97 + layerIndex);
			const resourceName = `${itemName}_64_${layerName}_${direction}_${layerFrame}`;
			const spriteName = `${resourceName}.png`;

			let asset = offset.assets[resourceName];
			if (asset?.source) {
				asset = offset.assets[asset.source];
			}

			const image = sprites[spriteName];
			if (image && asset) {
				chunks.push({
					asset: {
						image,
						x: asset.x,
						y: asset.y,
						isFlipped: asset.flipH === 1,
					},
					alpha,
					color,
					ink,
				});
			}
		}

		return chunks;
	}

	private _flipImage(image: HTMLCanvasElement): HTMLCanvasElement | null {
		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d");
		if (!context) return null;
		canvas.width = image.width;
		canvas.height = image.height;
		context.save();
		context.scale(-1, 1);
		context.drawImage(image, 0, 0, image.width * -1, image.height);
		context.restore();
		return canvas;
	}

	private _tintSprite(
		image: HTMLCanvasElement,
		color: number,
		alpha: number
	): HTMLCanvasElement | null {
		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d");
		if (!context) return null;

		canvas.width = image.width;
		canvas.height = image.height;
		context.drawImage(image, 0, 0);

		const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
		const r = (color >> 16) & 0xff;
		const g = (color >> 8) & 0xff;
		const b = color & 0xff;

		for (let index = 0; index < imageData.data.length; index += 4) {
			if (imageData.data[index + 3]! !== 0) {
				imageData.data[index] = Math.round((r * imageData.data[index]!) / 255);
				imageData.data[index + 1] = Math.round(
					(g * imageData.data[index + 1]!) / 255
				);
				imageData.data[index + 2] = Math.round(
					(b * imageData.data[index + 2]!) / 255
				);
				imageData.data[index + 3] = alpha;
			}
		}

		context.putImageData(imageData, 0, 0);
		return canvas;
	}

	private _loadImage(url: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const image = new Image();
			image.crossOrigin = "anonymous";
			image.addEventListener("load", () => {
				resolve(image);
			});
			image.addEventListener("error", () => {
				reject(new Error(`Failed to load image: ${url}`));
			});
			image.src = url;
		});
	}
}
