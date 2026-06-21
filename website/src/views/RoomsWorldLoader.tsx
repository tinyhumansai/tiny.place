"use client";

import dynamic from "next/dynamic";

import type { FunctionComponent } from "@src/common/types";

// WebGPU / canvas code must never run during SSR, so the world is loaded
// client-only.
const RoomsWorld = dynamic(
	() => import("@src/views/RoomsWorld").then((module) => module.RoomsWorld),
	{ ssr: false }
);

export const RoomsWorldLoader = (): FunctionComponent => {
	return <RoomsWorld />;
};
