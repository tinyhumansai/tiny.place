import { type RoomTheme, DEFAULT_THEME } from "./RoomTheme";

function flipCanvas(source: HTMLCanvasElement): HTMLCanvasElement | null {
	const canvas = document.createElement("canvas");
	const context = canvas.getContext("2d");
	if (!context) return null;

	canvas.width = source.width;
	canvas.height = source.height;
	context.save();
	context.scale(-1, 1);
	context.drawImage(source, 0, 0, source.width * -1, source.height);
	context.restore();
	return canvas;
}

function drawDiamond(
	context: CanvasRenderingContext2D,
	points: Array<{ x: number; y: number }>,
	strokeColor: string,
	fillColor: string
): void {
	context.strokeStyle = strokeColor;
	context.fillStyle = fillColor;
	context.beginPath();
	context.moveTo(points[0]!.x, points[0]!.y);
	for (let index = 1; index < points.length; index++) {
		context.lineTo(points[index]!.x, points[index]!.y);
	}
	context.closePath();
	context.stroke();
	context.fill();
}

function generateFloorTile(
	thickness: number,
	theme: RoomTheme
): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	const context = canvas.getContext("2d");
	canvas.width = 64;
	canvas.height = 39;

	if (context) {
		const startX = 32;
		const startY = 0;
		const tileW = 64;
		const tileH = 32;

		const points = [
			{ x: startX, y: startY },
			{ x: startX - tileW / 2, y: startY + tileH / 2 },
			{ x: startX, y: startY + tileH },
			{ x: startX + tileW / 2, y: startY + tileH / 2 },
		];

		drawDiamond(context, points, theme.floor.topStroke, theme.floor.top);

		if (thickness > 0) {
			drawDiamond(
				context,
				[
					{ x: points[1]!.x - 0.5, y: points[1]!.y },
					{ x: points[1]!.x - 0.5, y: points[1]!.y + thickness },
					{ x: points[2]!.x - 0.5, y: points[2]!.y + thickness },
					{ x: points[2]!.x - 0.5, y: points[2]!.y },
				],
				theme.floor.leftStroke,
				theme.floor.leftSide
			);
			drawDiamond(
				context,
				[
					{ x: points[3]!.x + 0.5, y: points[3]!.y },
					{ x: points[3]!.x + 0.5, y: points[3]!.y + thickness },
					{ x: points[2]!.x + 0.5, y: points[2]!.y + thickness },
					{ x: points[2]!.x + 0.5, y: points[2]!.y },
				],
				theme.floor.rightStroke,
				theme.floor.rightSide
			);
		}
	}
	return canvas;
}

function generateWallL(height: number, theme: RoomTheme): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	const context = canvas.getContext("2d");
	canvas.width = 40;
	canvas.height = 24 + height;

	if (context) {
		const points = [
			{ x: 32, y: 0 },
			{ x: 0, y: 16 },
			{ x: 8, y: 20 },
			{ x: 40, y: 4 },
		];
		drawDiamond(context, points, theme.wall.top, theme.wall.top);

		if (height > 0) {
			drawDiamond(
				context,
				[
					{ x: points[1]!.x - 0.5, y: points[1]!.y },
					{ x: points[1]!.x - 0.5, y: points[1]!.y + height },
					{ x: points[2]!.x - 0.5, y: points[2]!.y + height },
					{ x: points[2]!.x - 0.5, y: points[2]!.y },
				],
				theme.wall.leftFace,
				theme.wall.leftFace
			);
			drawDiamond(
				context,
				[
					{ x: points[3]!.x, y: points[3]!.y },
					{ x: points[3]!.x, y: points[3]!.y + height },
					{ x: points[2]!.x, y: points[2]!.y + height },
					{ x: points[2]!.x, y: points[2]!.y },
				],
				theme.wall.rightFace,
				theme.wall.rightFace
			);
		}
	}
	return canvas;
}

function generateWallR(height: number, theme: RoomTheme): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	const context = canvas.getContext("2d");
	canvas.width = 40;
	canvas.height = 24 + height;

	if (context) {
		const points = [
			{ x: 8, y: 0 },
			{ x: 40, y: 16 },
			{ x: 32, y: 20 },
			{ x: 0, y: 4 },
		];
		drawDiamond(context, points, theme.wall.top, theme.wall.top);

		if (height > 0) {
			drawDiamond(
				context,
				[
					{ x: points[1]!.x - 0.5, y: points[1]!.y },
					{ x: points[1]!.x - 0.5, y: points[1]!.y + height },
					{ x: points[2]!.x - 0.5, y: points[2]!.y + height },
					{ x: points[2]!.x - 0.5, y: points[2]!.y },
				],
				theme.wall.rightFace,
				theme.wall.rightFace
			);
			drawDiamond(
				context,
				[
					{ x: points[3]!.x, y: points[3]!.y },
					{ x: points[3]!.x, y: points[3]!.y + height },
					{ x: points[2]!.x, y: points[2]!.y + height },
					{ x: points[2]!.x, y: points[2]!.y },
				],
				theme.wall.rightFaceAlt,
				theme.wall.rightFaceAlt
			);
		}
	}
	return canvas;
}

function generateWallBeforeDoorL(
	height: number,
	theme: RoomTheme
): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	const context = canvas.getContext("2d");
	canvas.width = 40;
	canvas.height = 24 + height;

	if (context) {
		const points = [
			{ x: 32, y: 0 },
			{ x: 0, y: 16 },
			{ x: 8, y: 20 },
			{ x: 40, y: 4 },
		];
		drawDiamond(context, points, theme.wall.top, theme.wall.top);

		if (height > 0) {
			drawDiamond(
				context,
				[
					{ x: points[3]!.x, y: points[3]!.y },
					{ x: points[3]!.x, y: points[3]!.y + height },
					{ x: points[2]!.x, y: points[2]!.y + height },
					{ x: points[2]!.x, y: points[2]!.y },
				],
				theme.wall.rightFace,
				theme.wall.rightFace
			);
		}
	}
	return canvas;
}

function generateStair(
	strokeColor: string,
	floorColor: string,
	leftColorStroke: string,
	leftColor: string,
	rightColorStroke: string,
	rightColor: string,
	rightSide: boolean
): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	const context = canvas.getContext("2d");
	canvas.width = 99;
	canvas.height = 88;

	if (context) {
		const topFloorPoints = [
			{ x: 32, y: 0 },
			{ x: 0, y: 16 },
			{ x: 24, y: 28 },
			{ x: 56, y: 12 },
		];

		const stairPoints = [
			{ x: 32, y: 0 },
			{ x: 0, y: 16 },
			{ x: 10, y: 21 },
			{ x: 42, y: 5 },
		];

		const thickness = 7;

		drawDiamond(context, topFloorPoints, strokeColor, floorColor);
		drawDiamond(
			context,
			[
				{ x: topFloorPoints[1]!.x - 0.5, y: topFloorPoints[1]!.y },
				{
					x: topFloorPoints[1]!.x - 0.5,
					y: topFloorPoints[1]!.y + thickness,
				},
				{
					x: topFloorPoints[2]!.x - 0.5,
					y: topFloorPoints[2]!.y + thickness,
				},
				{ x: topFloorPoints[2]!.x - 0.5, y: topFloorPoints[2]!.y },
			],
			leftColorStroke,
			leftColor
		);
		drawDiamond(
			context,
			[
				{ x: topFloorPoints[3]!.x + 0.5, y: topFloorPoints[3]!.y },
				{
					x: topFloorPoints[3]!.x + 0.5,
					y: topFloorPoints[3]!.y + thickness,
				},
				{
					x: topFloorPoints[2]!.x + 0.5,
					y: topFloorPoints[2]!.y + thickness,
				},
				{ x: topFloorPoints[2]!.x + 0.5, y: topFloorPoints[2]!.y },
			],
			rightColorStroke,
			rightColor
		);

		for (let index = 3; index >= 0; index--) {
			const offsetX = 10 * index + 26;
			let offsetY = 13 * index + 19;
			let fixedThickness = thickness;
			if (rightSide) {
				if (index === 1) fixedThickness += 2;
				if (index === 3 || index === 2) offsetY += 1;
			}

			const stepPoints = stairPoints.map((p) => ({
				x: p.x + offsetX,
				y: p.y + offsetY,
			}));
			drawDiamond(context, stepPoints, strokeColor, floorColor);
			drawDiamond(
				context,
				[
					{ x: stepPoints[1]!.x - 0.5, y: stepPoints[1]!.y },
					{
						x: stepPoints[1]!.x - 0.5,
						y: stepPoints[1]!.y + fixedThickness,
					},
					{
						x: stepPoints[2]!.x - 0.5,
						y: stepPoints[2]!.y + fixedThickness,
					},
					{ x: stepPoints[2]!.x - 0.5, y: stepPoints[2]!.y },
				],
				leftColorStroke,
				leftColor
			);
			drawDiamond(
				context,
				[
					{ x: stepPoints[3]!.x + 0.5, y: stepPoints[3]!.y },
					{
						x: stepPoints[3]!.x + 0.5,
						y: stepPoints[3]!.y + fixedThickness,
					},
					{
						x: stepPoints[2]!.x + 0.5,
						y: stepPoints[2]!.y + fixedThickness,
					},
					{ x: stepPoints[2]!.x + 0.5, y: stepPoints[2]!.y },
				],
				rightColorStroke,
				rightColor
			);
		}
	}
	return canvas;
}

function generateStairL(theme: RoomTheme): HTMLCanvasElement {
	return generateStair(
		theme.floor.topStroke,
		theme.floor.top,
		theme.floor.leftStroke,
		theme.floor.leftSide,
		theme.floor.rightStroke,
		theme.floor.rightSide,
		false
	);
}

function generateStairR(theme: RoomTheme): HTMLCanvasElement | null {
	return flipCanvas(
		generateStair(
			theme.floor.topStroke,
			theme.floor.top,
			theme.floor.rightStroke,
			theme.floor.rightSide,
			theme.floor.leftStroke,
			theme.floor.leftSide,
			true
		)
	);
}

export default class RoomTileRenderer {
	private currentThemeId: string = "";

	public initialize(
		scene: Phaser.Scene,
		theme: RoomTheme = DEFAULT_THEME
	): void {
		this.currentThemeId = theme.id;

		const tileKey = `room_tile_${theme.id}`;
		if (!scene.textures.exists(tileKey)) {
			scene.textures.addCanvas(tileKey, generateFloorTile(7, theme));
		}

		const stairLKey = `room_stair_l_${theme.id}`;
		if (!scene.textures.exists(stairLKey)) {
			scene.textures.addCanvas(stairLKey, generateStairL(theme));
		}

		const stairRKey = `room_stair_r_${theme.id}`;
		const stairR = generateStairR(theme);
		if (stairR && !scene.textures.exists(stairRKey)) {
			scene.textures.addCanvas(stairRKey, stairR);
		}
	}

	public getFloorTileKey(): string {
		return `room_tile_${this.currentThemeId}`;
	}

	public getStairLKey(): string {
		return `room_stair_l_${this.currentThemeId}`;
	}

	public getStairRKey(): string {
		return `room_stair_r_${this.currentThemeId}`;
	}

	public getWallLKey(
		scene: Phaser.Scene,
		z: number,
		theme: RoomTheme = DEFAULT_THEME
	): string {
		const key = `room_wall_l_${theme.id}_${z}`;
		if (!scene.textures.exists(key)) {
			scene.textures.addCanvas(key, generateWallL(122 + z * 32, theme));
		}
		return key;
	}

	public getWallRKey(
		scene: Phaser.Scene,
		z: number,
		theme: RoomTheme = DEFAULT_THEME
	): string {
		const key = `room_wall_r_${theme.id}_${z}`;
		if (!scene.textures.exists(key)) {
			scene.textures.addCanvas(key, generateWallR(122 + z * 32, theme));
		}
		return key;
	}

	public getDoorLKey(
		scene: Phaser.Scene,
		theme: RoomTheme = DEFAULT_THEME
	): string {
		const key = `room_door_l_${theme.id}`;
		if (!scene.textures.exists(key)) {
			scene.textures.addCanvas(key, generateWallL(28, theme));
		}
		return key;
	}

	public getDoorBeforeLKey(
		scene: Phaser.Scene,
		z: number,
		theme: RoomTheme = DEFAULT_THEME
	): string {
		const key = `room_door_before_l_${theme.id}_${z}`;
		if (!scene.textures.exists(key)) {
			scene.textures.addCanvas(
				key,
				generateWallBeforeDoorL(122 + z * 32, theme)
			);
		}
		return key;
	}
}
