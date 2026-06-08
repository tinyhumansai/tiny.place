import { useEffect, useRef, useState, useCallback } from "react";
import type { FunctionComponent } from "@src/common/types";
import GameEngine from "@src/engine/GameEngine";
import type { Direction } from "@src/engine/imagers/AvatarInfo";
import {
	createDefaultRoom,
	createLShapedRoom,
	createMultiLevelRoom,
} from "@src/engine/RoomModel";

const DEFAULT_FIGURE =
	"hd-190-10.lg-3023-1408.ch-215-91.hr-893-45.ha-1003-1408";

const ROOM_PRESETS = [
	{ label: "Default 8x8", factory: createDefaultRoom },
	{ label: "L-Shaped", factory: createLShapedRoom },
	{ label: "Multi-Level", factory: createMultiLevelRoom },
] as const;

const DIRECTIONS: Array<{ label: string; value: Direction }> = [
	{ label: "N", value: 0 },
	{ label: "NE", value: 1 },
	{ label: "E", value: 2 },
	{ label: "SE", value: 3 },
	{ label: "S", value: 4 },
	{ label: "SW", value: 5 },
	{ label: "W", value: 6 },
	{ label: "NW", value: 7 },
];

let nextAvatarId = 1;

export function Room(): FunctionComponent {
	const canvasRef = useRef<HTMLDivElement>(null);
	const engineRef = useRef<GameEngine | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [selectedRoom, setSelectedRoom] = useState(0);
	const [avatarFigure, setAvatarFigure] = useState(DEFAULT_FIGURE);
	const [avatarX, setAvatarX] = useState(3);
	const [avatarY, setAvatarY] = useState(3);
	const [avatarDirection, setAvatarDirection] = useState<Direction>(2);
	const [avatarList, setAvatarList] = useState<
		Array<{ id: number; name: string; figure: string }>
	>([]);

	useEffect(() => {
		const engine = new GameEngine();
		engineRef.current = engine;

		engine
			.initialize()
			.then(() => {
				if (canvasRef.current && engineRef.current === engine) {
					engine.mount(canvasRef.current);
					engine.loadRoom(createDefaultRoom());
					setLoading(false);
				}
			})
			.catch((error_) => {
				console.error("Engine init failed:", error_);
				setError(error_ instanceof Error ? error_.message : String(error_));
				setLoading(false);
			});

		const handleResize = (): void => {
			if (canvasRef.current && engineRef.current) {
				engineRef.current.resize(
					canvasRef.current.clientWidth,
					canvasRef.current.clientHeight
				);
			}
		};
		window.addEventListener("resize", handleResize);

		return (): void => {
			window.removeEventListener("resize", handleResize);
			engine.destroy();
			engineRef.current = null;
		};
	}, []);

	const handleRoomChange = useCallback((index: number) => {
		setSelectedRoom(index);
		setAvatarList([]);
		if (engineRef.current) {
			const preset = ROOM_PRESETS[index];
			if (!preset) return;
			const model = preset.factory();
			engineRef.current.loadRoom(model);
		}
	}, []);

	const handleAddAvatar = useCallback(() => {
		if (!engineRef.current) return;
		const id = nextAvatarId++;
		const name = `Avatar ${id}`;
		const engine = engineRef.current;
		void engine
			.addAvatar(id, name, avatarFigure, avatarX, avatarY, 0, avatarDirection)
			.then(() => {
				engine.enableAutonomy(id);
			});
		setAvatarList((previous) => [
			...previous,
			{ id, name, figure: avatarFigure },
		]);
	}, [avatarFigure, avatarX, avatarY, avatarDirection]);

	const handleRemoveAvatar = useCallback((id: number) => {
		if (!engineRef.current) return;
		engineRef.current.removeAvatar(id);
		setAvatarList((previous) => previous.filter((a) => a.id !== id));
	}, []);

	const handleMoveAvatar = useCallback(
		(id: number) => {
			if (!engineRef.current) return;
			engineRef.current.moveAvatar(id, avatarX, avatarY, avatarDirection);
		},
		[avatarX, avatarY, avatarDirection]
	);

	const handleCenterCamera = useCallback(() => {
		engineRef.current?.centerCamera();
	}, []);

	return (
		<div className="flex h-screen w-screen bg-gray-900">
			{/* Room canvas - 90% */}
			<div ref={canvasRef} className="relative flex-1">
				{loading && (
					<div className="absolute inset-0 flex items-center justify-center bg-gray-900">
						<div className="text-center">
							<div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent mx-auto" />
							<p className="text-gray-400">Loading sprites...</p>
						</div>
					</div>
				)}
				{error && (
					<div className="absolute inset-0 flex items-center justify-center bg-gray-900">
						<div className="rounded-lg bg-red-900/50 p-6 text-center">
							<p className="text-red-400">Error: {error}</p>
						</div>
					</div>
				)}
			</div>

			{/* Controls panel - 10% */}
			<div className="w-80 overflow-y-auto border-l border-gray-700 bg-gray-800 p-4 text-sm text-gray-200">
				<h2 className="mb-4 text-lg font-bold text-white">Room Controls</h2>

				{/* Room Selection */}
				<section className="mb-6">
					<h3 className="mb-2 font-semibold text-gray-300">Room Layout</h3>
					<div className="flex flex-col gap-1">
						{ROOM_PRESETS.map((preset, index) => (
							<button
								key={preset.label}
								type="button"
								className={`rounded px-3 py-1.5 text-left transition-colors ${
									selectedRoom === index
										? "bg-blue-600 text-white"
										: "bg-gray-700 text-gray-300 hover:bg-gray-600"
								}`}
								onClick={() => {
									handleRoomChange(index);
								}}
							>
								{preset.label}
							</button>
						))}
					</div>
				</section>

				{/* Camera */}
				<section className="mb-6">
					<h3 className="mb-2 font-semibold text-gray-300">Camera</h3>
					<button
						className="w-full rounded bg-gray-700 px-3 py-1.5 text-gray-300 hover:bg-gray-600"
						type="button"
						onClick={handleCenterCamera}
					>
						Center Camera
					</button>
					<p className="mt-1 text-xs text-gray-500">Drag the room to pan</p>
				</section>

				{/* Avatar Controls */}
				<section className="mb-6">
					<h3 className="mb-2 font-semibold text-gray-300">Add Avatar</h3>
					<div className="flex flex-col gap-2">
						<label className="text-xs text-gray-400">
							Figure String
							<textarea
								className="mt-1 w-full rounded bg-gray-700 px-2 py-1 text-xs text-gray-200 font-mono"
								rows={2}
								value={avatarFigure}
								onChange={(event) => {
									setAvatarFigure(event.target.value);
								}}
							/>
						</label>
						<div className="flex gap-2">
							<label className="flex-1 text-xs text-gray-400">
								X
								<input
									className="mt-1 w-full rounded bg-gray-700 px-2 py-1 text-gray-200"
									max={20}
									min={0}
									type="number"
									value={avatarX}
									onChange={(event) => {
										setAvatarX(Number(event.target.value));
									}}
								/>
							</label>
							<label className="flex-1 text-xs text-gray-400">
								Y
								<input
									className="mt-1 w-full rounded bg-gray-700 px-2 py-1 text-gray-200"
									max={20}
									min={0}
									type="number"
									value={avatarY}
									onChange={(event) => {
										setAvatarY(Number(event.target.value));
									}}
								/>
							</label>
						</div>
						<label className="text-xs text-gray-400">
							Direction
							<div className="mt-1 grid grid-cols-4 gap-1">
								{DIRECTIONS.map((direction) => (
									<button
										key={direction.value}
										type="button"
										className={`rounded px-2 py-1 text-xs ${
											avatarDirection === direction.value
												? "bg-blue-600 text-white"
												: "bg-gray-700 text-gray-300 hover:bg-gray-600"
										}`}
										onClick={() => {
											setAvatarDirection(direction.value);
										}}
									>
										{direction.label}
									</button>
								))}
							</div>
						</label>
						<button
							className="mt-1 w-full rounded bg-green-700 px-3 py-2 font-semibold text-white hover:bg-green-600"
							disabled={loading}
							type="button"
							onClick={handleAddAvatar}
						>
							Add Avatar
						</button>
					</div>
				</section>

				{/* Avatar List */}
				{avatarList.length > 0 && (
					<section className="mb-6">
						<h3 className="mb-2 font-semibold text-gray-300">
							Avatars in Room
						</h3>
						<div className="flex flex-col gap-2">
							{avatarList.map((avatar) => (
								<div
									key={avatar.id}
									className="flex items-center justify-between rounded bg-gray-700 px-3 py-2"
								>
									<span className="text-xs text-gray-300">{avatar.name}</span>
									<div className="flex gap-1">
										<button
											className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-500"
											type="button"
											onClick={() => {
												handleMoveAvatar(avatar.id);
											}}
										>
											Move
										</button>
										<button
											className="rounded bg-red-700 px-2 py-0.5 text-xs text-white hover:bg-red-600"
											type="button"
											onClick={() => {
												handleRemoveAvatar(avatar.id);
											}}
										>
											Remove
										</button>
									</div>
								</div>
							))}
						</div>
					</section>
				)}

				{/* Info */}
				<section className="mt-auto border-t border-gray-700 pt-4">
					<h3 className="mb-2 font-semibold text-gray-300">Debug Info</h3>
					<p className="text-xs text-gray-500">
						Room: {ROOM_PRESETS[selectedRoom]?.label}
					</p>
					<p className="text-xs text-gray-500">Avatars: {avatarList.length}</p>
					<p className="mt-2 text-xs text-gray-600">
						Engine: PixiJS + Bobba sprite renderer
					</p>
				</section>
			</div>
		</div>
	);
}
