"use client";

import { useEffect } from "react";

import { useAppStore } from "@src/store/app";

/**
 * Mirrors app appearance state onto the document root. Tailwind's generated
 * color utilities read CSS variables from these attributes, so theme and flavor
 * changes repaint without remounting screens or rebuilding class names.
 */
export function ThemeController(): null {
	const flavor = useAppStore((state) => state.flavor);
	const theme = useAppStore((state) => state.theme);

	useEffect(() => {
		const root = document.documentElement;
		root.dataset["theme"] = theme;
		if (flavor === "default") {
			delete root.dataset["flavor"];
		} else {
			root.dataset["flavor"] = flavor;
		}
	}, [flavor, theme]);

	return null;
}
