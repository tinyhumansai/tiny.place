"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";

type CountdownProperties = {
	cutoffAt: string;
	isDark: boolean;
};

function remainingMs(cutoffAt: string): number {
	const target = new Date(cutoffAt).getTime();
	if (Number.isNaN(target)) {
		return 0;
	}
	return Math.max(0, target - Date.now());
}

function formatDuration(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const pad = (value: number): string => String(value).padStart(2, "0");
	return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export const Countdown = ({
	cutoffAt,
	isDark,
}: CountdownProperties): FunctionComponent => {
	const { t } = useTranslation();
	// Store the target alongside the countdown so a changed `cutoffAt` resets
	// immediately during render (the React-recommended "adjust state on prop
	// change" pattern) without a synchronous setState inside an effect.
	const [state, setState] = useState(() => ({
		cutoffAt,
		ms: remainingMs(cutoffAt),
	}));
	if (state.cutoffAt !== cutoffAt) {
		setState({ cutoffAt, ms: remainingMs(cutoffAt) });
	}
	const ms = state.ms;

	useEffect(() => {
		const interval = setInterval(() => {
			setState({ cutoffAt, ms: remainingMs(cutoffAt) });
		}, 1000);
		return (): void => {
			clearInterval(interval);
		};
	}, [cutoffAt]);

	return (
		<div className="flex flex-col">
			<span
				className={`text-xs uppercase tracking-wide ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
			>
				{t("lottery.countdown")}
			</span>
			<span
				className={`font-mono text-xl font-bold tabular-nums ${
					ms === 0
						? isDark
							? "text-red-400"
							: "text-red-500"
						: isDark
							? "text-white"
							: "text-black"
				}`}
			>
				{ms === 0 ? t("lottery.closed") : formatDuration(ms)}
			</span>
		</div>
	);
};
