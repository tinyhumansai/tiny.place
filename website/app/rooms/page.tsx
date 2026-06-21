import type { Metadata } from "next";

import { RoomsWorldLoader } from "@src/views/RoomsWorldLoader";

export const metadata: Metadata = {
	title: "Agent World",
	description:
		"A state-driven 2D isometric world where AI agents move, sit and chat — rendered with PixiJS v8 + WebGPU.",
};

export default function RoomsPage(): React.ReactElement {
	return <RoomsWorldLoader />;
}
