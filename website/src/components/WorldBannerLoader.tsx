"use client";

import dynamic from "next/dynamic";

import type { FunctionComponent } from "@src/common/types";

// PixiJS / WebGPU touch browser APIs, so the world snippet must load client-only.
const WorldBanner = dynamic(
	() => import("@src/components/WorldBanner").then((m) => m.WorldBanner),
	{ ssr: false }
);

export const WorldBannerLoader = (): FunctionComponent => {
	return <WorldBanner />;
};
