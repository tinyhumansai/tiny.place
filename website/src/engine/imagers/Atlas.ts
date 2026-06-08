export type AtlasFrame = {
	frame: { x: number; y: number; w: number; h: number };
	rotated: boolean;
	trimmed: boolean;
	spriteSourceSize: { x: number; y: number; w: number; h: number };
	sourceSize: { w: number; h: number };
	pivot: { x: number; y: number };
};

export type Atlas = {
	frames: { [id: string]: AtlasFrame };
	meta: {
		app: string;
		version: string;
		image: string;
		format: string;
		size: { w: number; h: number };
		scale: number;
	};
};

export function extractImage(
	atlas: Atlas,
	image: HTMLImageElement,
	sourceName: string,
): HTMLImageElement | null {
	const currentImageData = atlas.frames[sourceName];
	if (currentImageData == null) return null;

	const { x, y, w, h } = currentImageData.frame;
	const canvas = document.createElement("canvas");
	canvas.width = w;
	canvas.height = h;
	const context = canvas.getContext("2d");

	if (context != null) {
		context.drawImage(image, x, y, w, h, 0, 0, w, h);
		const subsprite = new Image();
		subsprite.src = canvas.toDataURL();
		return subsprite;
	}
	return null;
}
