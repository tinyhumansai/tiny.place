"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { locales } from "@src/common/locales";
import type { FunctionComponent } from "@src/common/types";
import { useAppStore } from "@src/store/app";

/**
 * Compact flag language picker for the header, sitting next to the wallet
 * connect button. Shows the active locale's flag; opening it lists every locale
 * by flag + native name. Selection drives i18next (persisted by its
 * LanguageDetector); the LocaleController mirrors the choice onto `<html>`.
 */
export const LanguageSelector = (): FunctionComponent => {
	const { i18n, t } = useTranslation();
	const isDark = useAppStore((state) => state.theme === "dark");
	const [open, setOpen] = useState(false);

	const active = i18n.resolvedLanguage ?? i18n.language;
	const current = locales.find((locale) => locale.code === active);

	const panelClass = isDark
		? "border-neutral-800 bg-neutral-950 text-white"
		: "border-neutral-200 bg-white text-black";
	const buttonClass = `flex items-center justify-center rounded-full border px-2.5 py-1.5 text-base leading-none transition-colors ${
		isDark
			? "border-neutral-700 hover:border-neutral-500"
			: "border-neutral-300 hover:border-neutral-400"
	}`;
	const itemClass = (selected: boolean): string =>
		`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
			selected
				? "theme-primary-selected"
				: isDark
					? "hover:bg-neutral-800"
					: "hover:bg-neutral-100"
		}`;

	return (
		<div className="relative">
			<button
				aria-haspopup="menu"
				aria-label={t("settings.language")}
				className={buttonClass}
				title={t("settings.language")}
				type="button"
				onClick={(): void => {
					setOpen((value) => !value);
				}}
			>
				<span aria-hidden>{current?.flag ?? "🌐"}</span>
			</button>
			{open && (
				<>
					{/* Click-away backdrop. */}
					<div
						className="fixed inset-0 z-40"
						onClick={(): void => {
							setOpen(false);
						}}
					/>
					<div
						className={`absolute right-0 z-50 mt-2 max-h-80 w-48 overflow-y-auto rounded-xl border p-1 shadow-xl ${panelClass}`}
						role="menu"
					>
						{locales.map((locale) => (
							<button
								key={locale.code}
								className={itemClass(locale.code === active)}
								role="menuitem"
								type="button"
								onClick={(): void => {
									void i18n.changeLanguage(locale.code);
									setOpen(false);
								}}
							>
								<span aria-hidden>{locale.flag}</span>
								<span className="truncate">{locale.nativeName}</span>
							</button>
						))}
					</div>
				</>
			)}
		</div>
	);
};
