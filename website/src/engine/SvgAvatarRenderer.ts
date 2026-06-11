import type { AvatarAppearance, AvatarAction, Direction } from "./types";
import { AVATAR_SVG_WIDTH, AVATAR_SVG_HEIGHT } from "./constants";

const SKIN_COLORS = [
	"#f5d0a9",
	"#e8b88a",
	"#d4956b",
	"#c07850",
	"#8d5534",
	"#6b3e26",
];
const HAIR_COLORS = [
	"#2c1b0e",
	"#4a3328",
	"#8b6f47",
	"#d4a657",
	"#c44e2e",
	"#3d3d3d",
];
const SHIRT_COLORS = [
	"#4a90d9",
	"#e74c3c",
	"#2ecc71",
	"#f39c12",
	"#9b59b6",
	"#1abc9c",
	"#e67e22",
	"#34495e",
];
const PANTS_COLORS = [
	"#2c3e50",
	"#34495e",
	"#1a1a2e",
	"#4a4a6a",
	"#3d5c5c",
	"#5c3d3d",
];

function pickFromSeed(array: Array<string>, seed: string): string {
	let hash = 0;
	for (let index = 0; index < seed.length; index++) {
		hash = (hash * 31 + seed.charCodeAt(index)) | 0;
	}
	return array[Math.abs(hash) % array.length]!;
}

export function appearanceFromFigure(figure: string): AvatarAppearance {
	return {
		skinColor: pickFromSeed(SKIN_COLORS, `skin-${figure}`),
		hairColor: pickFromSeed(HAIR_COLORS, `hair-${figure}`),
		hairStyle: Math.abs(figure.length * 7) % 3,
		shirtColor: pickFromSeed(SHIRT_COLORS, `shirt-${figure}`),
		pantsColor: pickFromSeed(PANTS_COLORS, `pants-${figure}`),
	};
}

export function randomAppearance(): AvatarAppearance {
	const pick = <T>(array: Array<T>): T =>
		array[Math.floor(Math.random() * array.length)]!;
	return {
		skinColor: pick(SKIN_COLORS),
		hairColor: pick(HAIR_COLORS),
		hairStyle: Math.floor(Math.random() * 3),
		shirtColor: pick(SHIRT_COLORS),
		pantsColor: pick(PANTS_COLORS),
	};
}

function darken(hex: string, factor: number): string {
	const r = Math.max(0, Math.round(Number.parseInt(hex.slice(1, 3), 16) * factor));
	const g = Math.max(0, Math.round(Number.parseInt(hex.slice(3, 5), 16) * factor));
	const b = Math.max(0, Math.round(Number.parseInt(hex.slice(5, 7), 16) * factor));
	return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function generateHairPath(style: number, direction: number): string {
	if (direction === 2) {
		switch (style) {
			case 0:
				return "M20,18 Q32,6 44,18 L44,24 Q32,16 20,24 Z";
			case 1:
				return "M18,18 Q32,2 46,18 L46,28 Q32,14 18,28 Z";
			default:
				return "M16,20 Q32,0 48,20 L48,36 Q44,28 32,26 Q20,28 16,36 Z";
		}
	}
	if (direction === 1) {
		switch (style) {
			case 0:
				return "M22,18 Q34,8 44,18 L44,24 Q34,17 22,24 Z";
			case 1:
				return "M20,18 Q34,4 46,18 L46,28 Q34,15 20,28 Z";
			default:
				return "M18,20 Q34,2 48,20 L48,36 Q44,28 34,26 Q22,28 18,36 Z";
		}
	}
	switch (style) {
		case 0:
			return "M24,20 Q32,12 40,20 L40,26 Q32,20 24,26 Z";
		case 1:
			return "M22,18 Q32,6 42,18 L42,28 Q32,14 22,28 Z";
		default:
			return "M20,20 Q32,4 44,20 L44,36 Q40,28 32,26 Q24,28 20,36 Z";
	}
}

function generateLegOffsets(
	action: AvatarAction,
	frame: number
): { leftY: number; rightY: number; leftX: number; rightX: number } {
	if (action === "walking") {
		const offsets = [
			{ leftY: -4, rightY: 4, leftX: -1, rightX: 1 },
			{ leftY: 0, rightY: 0, leftX: 0, rightX: 0 },
			{ leftY: 4, rightY: -4, leftX: 1, rightX: -1 },
			{ leftY: 0, rightY: 0, leftX: 0, rightX: 0 },
		];
		return offsets[frame % 4]!;
	}
	if (action === "sitting") {
		return { leftY: -2, rightY: -2, leftX: 2, rightX: -2 };
	}
	return { leftY: 0, rightY: 0, leftX: 0, rightX: 0 };
}

export function generateAvatarSvg(
	appearance: AvatarAppearance,
	direction: number,
	action: AvatarAction,
	frame: number
): string {
	const w = AVATAR_SVG_WIDTH;
	const h = AVATAR_SVG_HEIGHT;
	const cx = w / 2;

	const skinDark = darken(appearance.skinColor, 0.85);
	const shirtDark = darken(appearance.shirtColor, 0.8);

	const isSide = direction === 2 || direction === 0;
	const isFront = direction === 2;
	const isDiag = direction === 1;

	const headRx = isSide ? 11 : isDiag ? 12 : 10;
	const headRy = 11;
	const headCy = 24;

	const bodyW = isSide ? 20 : isDiag ? 22 : 16;
	const bodyH = 28;
	const bodyY = 34;

	const legOffsets = generateLegOffsets(action, frame);
	const legW = 7;
	const legH = action === "sitting" ? 18 : 26;
	const legY = action === "sitting" ? bodyY + bodyH - 4 : bodyY + bodyH - 2;
	const legGap = isSide ? 3 : isDiag ? 4 : 5;

	const armW = 6;
	const armH = 22;
	const armY = bodyY + 2;

	const wavingArm = action === "waving";
	const waveFrame = frame % 2;

	const parts: Array<string> = [];

	parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`);

	const shadowCx = cx;
	const shadowCy = action === "sitting" ? h - 10 : h - 6;
	parts.push(
		`<ellipse cx="${shadowCx}" cy="${shadowCy}" rx="16" ry="5" fill="rgba(0,0,0,0.15)"/>`
	);

	const leftLegX = cx - legGap - legW / 2 + legOffsets.leftX;
	const rightLegX = cx + legGap - legW / 2 + legOffsets.rightX;
	const leftLegY = legY + legOffsets.leftY;
	const rightLegY = legY + legOffsets.rightY;

	parts.push(
		`<rect x="${leftLegX}" y="${leftLegY}" width="${legW}" height="${legH}" rx="2" fill="${appearance.pantsColor}"/>`
	);
	parts.push(
		`<rect x="${rightLegX}" y="${rightLegY}" width="${legW}" height="${legH}" rx="2" fill="${darken(appearance.pantsColor, 0.9)}"/>`
	);

	parts.push(
		`<rect x="${cx - bodyW / 2}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="3" fill="${appearance.shirtColor}"/>`
	);
	if (isSide || isDiag) {
		parts.push(
			`<rect x="${cx}" y="${bodyY}" width="${bodyW / 2}" height="${bodyH}" rx="0" fill="${shirtDark}"/>`
		);
	}

	const leftArmX = cx - bodyW / 2 - armW + 1;
	const rightArmX = cx + bodyW / 2 - 1;

	if (wavingArm && waveFrame === 0) {
		parts.push(
			`<rect x="${rightArmX}" y="${armY - 16}" width="${armW}" height="${armH}" rx="2" fill="${appearance.skinColor}" transform="rotate(-30 ${rightArmX + armW / 2} ${armY - 16})"/>`
		);
	} else if (wavingArm && waveFrame === 1) {
		parts.push(
			`<rect x="${rightArmX}" y="${armY - 20}" width="${armW}" height="${armH}" rx="2" fill="${appearance.skinColor}" transform="rotate(-50 ${rightArmX + armW / 2} ${armY - 20})"/>`
		);
	} else {
		parts.push(
			`<rect x="${rightArmX}" y="${armY}" width="${armW}" height="${armH}" rx="2" fill="${skinDark}"/>`
		);
	}
	parts.push(
		`<rect x="${leftArmX}" y="${armY}" width="${armW}" height="${armH}" rx="2" fill="${appearance.skinColor}"/>`
	);

	parts.push(
		`<ellipse cx="${cx}" cy="${headCy}" rx="${headRx}" ry="${headRy}" fill="${appearance.skinColor}"/>`
	);
	if (isSide || isDiag) {
		parts.push(
			`<ellipse cx="${cx + 2}" cy="${headCy}" rx="${headRx - 3}" ry="${headRy - 1}" fill="${skinDark}" opacity="0.3"/>`
		);
	}

	parts.push(
		`<path d="${generateHairPath(appearance.hairStyle, direction)}" fill="${appearance.hairColor}"/>`
	);

	if (isFront || isDiag) {
		const eyeOffsetX = isDiag ? 2 : 0;
		parts.push(
			`<circle cx="${cx - 4 + eyeOffsetX}" cy="${headCy - 1}" r="1.5" fill="#333"/>`
		);
		parts.push(
			`<circle cx="${cx + 4 + eyeOffsetX}" cy="${headCy - 1}" r="1.5" fill="#333"/>`
		);
		parts.push(
			`<ellipse cx="${cx + eyeOffsetX}" cy="${headCy + 4}" rx="2" ry="1" fill="${skinDark}"/>`
		);
	}

	parts.push("</svg>");
	return parts.join("");
}

export function renderSvgToCanvas(
	svgString: string,
	width: number,
	height: number
): Promise<HTMLCanvasElement> {
	return new Promise((resolve, reject) => {
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext("2d");
		if (!context) {
			reject(new Error("Could not get canvas 2d context"));
			return;
		}

		const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const img = new Image();
		img.onload = (): void => {
			context.drawImage(img, 0, 0, width, height);
			URL.revokeObjectURL(url);
			resolve(canvas);
		};
		img.onerror = (): void => {
			URL.revokeObjectURL(url);
			reject(new Error("Failed to render SVG to canvas"));
		};
		img.src = url;
	});
}

export async function generateAllTextures(
	scene: Phaser.Scene,
	keyPrefix: string,
	appearance: AvatarAppearance
): Promise<void> {
	const directions: Array<number> = [0, 1, 2];
	const actions: Array<{ action: AvatarAction; frames: number }> = [
		{ action: "idle", frames: 1 },
		{ action: "walking", frames: 4 },
		{ action: "waving", frames: 2 },
		{ action: "sitting", frames: 1 },
	];

	const promises: Array<Promise<void>> = [];

	for (const direction of directions) {
		for (const { action, frames } of actions) {
			for (let frame = 0; frame < frames; frame++) {
				const key = `${keyPrefix}_${direction}_${action}_${frame}`;
				if (scene.textures.exists(key)) continue;

				const svg = generateAvatarSvg(appearance, direction, action, frame);
				promises.push(
					renderSvgToCanvas(svg, AVATAR_SVG_WIDTH, AVATAR_SVG_HEIGHT).then(
						(canvas) => {
							if (!scene.textures.exists(key)) {
								scene.textures.addCanvas(key, canvas);
							}
						}
					)
				);
			}
		}
	}

	await Promise.all(promises);
}

export function getTextureKey(
	keyPrefix: string,
	direction: Direction,
	action: AvatarAction,
	frame: number
): { key: string; flipX: boolean } {
	let renderDirection = direction as number;
	let flipX = false;

	if (direction >= 4) {
		const mirrorMap: Record<number, number> = { 4: 0, 5: 1, 6: 2, 7: 1 };
		renderDirection = mirrorMap[direction]!;
		flipX = true;
	}
	if (direction === 3) {
		renderDirection = 1;
	}

	return {
		key: `${keyPrefix}_${renderDirection}_${action}_${frame % (action === "walking" ? 4 : action === "waving" ? 2 : 1)}`,
		flipX,
	};
}
