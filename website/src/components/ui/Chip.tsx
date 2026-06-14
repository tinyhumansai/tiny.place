"use client";

import type { ReactNode } from "react";

import type { FunctionComponent } from "@src/common/types";

type ChipShape = "pill" | "rounded";

type ChipProps = {
	active: boolean;
	children: ReactNode;
	isDark: boolean;
	onClick: () => void;
	shape?: ChipShape;
	title?: string;
};

/**
 * A single high-contrast selector chip used for tabs, filters, breadcrumbs and
 * segmented controls across the app. The selected state inverts against the
 * theme (black-on-white in dark mode, white-on-black in light mode) for maximum
 * contrast; the unselected state is a subtle filled pill that lifts on hover.
 */
export const Chip = ({
	active,
	children,
	isDark,
	onClick,
	shape = "rounded",
	title,
}: ChipProps): FunctionComponent => {
	const radius = shape === "pill" ? "rounded-full" : "rounded-md";
	const stateClasses = active
		? isDark
			? "bg-white text-black"
			: "bg-black text-white"
		: isDark
			? "bg-neutral-900 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
			: "bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700";

	return (
		<button
			className={`${radius} px-2.5 py-1 text-xs font-medium transition-colors ${stateClasses}`}
			title={title}
			type="button"
			onClick={onClick}
		>
			{children}
		</button>
	);
};
