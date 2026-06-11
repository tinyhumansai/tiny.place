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

function generateFloorTile(thickness: number): HTMLCanvasElement {
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

		drawDiamond(context, points, "rgba(142,142,94,127)", "#989865");

		if (thickness > 0) {
			drawDiamond(
				context,
				[
					{ x: points[1]!.x - 0.5, y: points[1]!.y },
					{ x: points[1]!.x - 0.5, y: points[1]!.y + thickness },
					{ x: points[2]!.x - 0.5, y: points[2]!.y + thickness },
					{ x: points[2]!.x - 0.5, y: points[2]!.y },
				],
				"#7A7A51",
				"#838357"
			);
			drawDiamond(
				context,
				[
					{ x: points[3]!.x + 0.5, y: points[3]!.y },
					{ x: points[3]!.x + 0.5, y: points[3]!.y + thickness },
					{ x: points[2]!.x + 0.5, y: points[2]!.y + thickness },
					{ x: points[2]!.x + 0.5, y: points[2]!.y },
				],
				"#676744",
				"#6F6F49"
			);
		}
	}
	return canvas;
}

function generateWallL(height: number): HTMLCanvasElement {
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
		drawDiamond(context, points, "#70727a", "#70727a");

		if (height > 0) {
			drawDiamond(
				context,
				[
					{ x: points[1]!.x - 0.5, y: points[1]!.y },
					{ x: points[1]!.x - 0.5, y: points[1]!.y + height },
					{ x: points[2]!.x - 0.5, y: points[2]!.y + height },
					{ x: points[2]!.x - 0.5, y: points[2]!.y },
				],
				"#bbbecd",
				"#bbbecd"
			);
			drawDiamond(
				context,
				[
					{ x: points[3]!.x, y: points[3]!.y },
					{ x: points[3]!.x, y: points[3]!.y + height },
					{ x: points[2]!.x, y: points[2]!.y + height },
					{ x: points[2]!.x, y: points[2]!.y },
				],
				"#90929e",
				"#90929e"
			);
		}
	}
	return canvas;
}

function generateWallR(height: number): HTMLCanvasElement {
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
		drawDiamond(context, points, "#70727a", "#70727a");

		if (height > 0) {
			drawDiamond(
				context,
				[
					{ x: points[1]!.x - 0.5, y: points[1]!.y },
					{ x: points[1]!.x - 0.5, y: points[1]!.y + height },
					{ x: points[2]!.x - 0.5, y: points[2]!.y + height },
					{ x: points[2]!.x - 0.5, y: points[2]!.y },
				],
				"#90929e",
				"#90929e"
			);
			drawDiamond(
				context,
				[
					{ x: points[3]!.x, y: points[3]!.y },
					{ x: points[3]!.x, y: points[3]!.y + height },
					{ x: points[2]!.x, y: points[2]!.y + height },
					{ x: points[2]!.x, y: points[2]!.y },
				],
				"#b6b9c8",
				"#b6b9c8"
			);
		}
	}
	return canvas;
}

function generateWallBeforeDoorL(height: number): HTMLCanvasElement {
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
		drawDiamond(context, points, "#6f717a", "#70727a");

		if (height > 0) {
			drawDiamond(
				context,
				[
					{ x: points[3]!.x, y: points[3]!.y },
					{ x: points[3]!.x, y: points[3]!.y + height },
					{ x: points[2]!.x, y: points[2]!.y + height },
					{ x: points[2]!.x, y: points[2]!.y },
				],
				"#90929e",
				"#90929e"
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

function generateStairL(): HTMLCanvasElement {
	return generateStair(
		"rgba(142,142,94,127)",
		"#989865",
		"#7A7A51",
		"#838357",
		"#676744",
		"#6F6F49",
		false
	);
}

function generateStairR(): HTMLCanvasElement | null {
	return flipCanvas(
		generateStair(
			"rgba(142,142,94,127)",
			"#989865",
			"#676744",
			"#6F6F49",
			"#7A7A51",
			"#838357",
			true
		)
	);
}

export default class RoomTileRenderer {
	public initialize(scene: Phaser.Scene): void {
		if (!scene.textures.exists("room_tile")) {
			scene.textures.addCanvas("room_tile", generateFloorTile(7));
		}

		const stairL = generateStairL();
		if (!scene.textures.exists("room_stair_l")) {
			scene.textures.addCanvas("room_stair_l", stairL);
		}

		const stairR = generateStairR();
		if (stairR && !scene.textures.exists("room_stair_r")) {
			scene.textures.addCanvas("room_stair_r", stairR);
		}
	}

	public getWallLKey(scene: Phaser.Scene, z: number): string {
		const key = `room_wall_l_${z}`;
		if (!scene.textures.exists(key)) {
			scene.textures.addCanvas(key, generateWallL(122 + z * 32));
		}
		return key;
	}

	public getWallRKey(scene: Phaser.Scene, z: number): string {
		const key = `room_wall_r_${z}`;
		if (!scene.textures.exists(key)) {
			scene.textures.addCanvas(key, generateWallR(122 + z * 32));
		}
		return key;
	}

	public getDoorLKey(scene: Phaser.Scene): string {
		const key = "room_door_l";
		if (!scene.textures.exists(key)) {
			scene.textures.addCanvas(key, generateWallL(28));
		}
		return key;
	}

	public getDoorBeforeLKey(scene: Phaser.Scene, z: number): string {
		const key = `room_door_before_l_${z}`;
		if (!scene.textures.exists(key)) {
			scene.textures.addCanvas(
				key,
				generateWallBeforeDoorL(122 + z * 32)
			);
		}
		return key;
	}
}
