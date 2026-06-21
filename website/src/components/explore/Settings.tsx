"use client";

import { CheckIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

import { locales } from "@src/common/locales";
import type { FunctionComponent } from "@src/common/types";
import { useAppStore } from "@src/store/app";

type ThemeMode = "light" | "dark";
type ThemeFlavor = "default" | "dark-blue" | "green" | "mint" | "violet";

type ThemeOption = {
	accent: string;
	background: string;
	flavor: ThemeFlavor;
	foreground: string;
	labelKey: string;
	mode: ThemeMode;
	surface: string;
};

const themeOptions: Array<ThemeOption> = [
	{
		labelKey: "settings.themes.dark",
		mode: "dark",
		flavor: "default",
		background: "#050505",
		surface: "#171717",
		foreground: "#fafafa",
		accent: "#2563eb",
	},
	{
		labelKey: "settings.themes.light",
		mode: "light",
		flavor: "default",
		background: "#ffffff",
		surface: "#f5f5f5",
		foreground: "#111111",
		accent: "#111111",
	},
	{
		labelKey: "settings.themes.green",
		mode: "light",
		flavor: "green",
		background: "#f7fdf9",
		surface: "#dcfce7",
		foreground: "#052e1a",
		accent: "#047857",
	},
	{
		labelKey: "settings.themes.darkGreen",
		mode: "dark",
		flavor: "green",
		background: "#02130d",
		surface: "#073526",
		foreground: "#ecfdf5",
		accent: "#10b981",
	},
	{
		labelKey: "settings.themes.darkBlue",
		mode: "dark",
		flavor: "dark-blue",
		background: "#020617",
		surface: "#0f172a",
		foreground: "#e0f2fe",
		accent: "#38bdf8",
	},
	{
		labelKey: "settings.themes.mint",
		mode: "light",
		flavor: "mint",
		background: "#f0fdfa",
		surface: "#99f6e4",
		foreground: "#042f2e",
		accent: "#0f766e",
	},
	{
		labelKey: "settings.themes.violet",
		mode: "dark",
		flavor: "violet",
		background: "#10051f",
		surface: "#251044",
		foreground: "#f5f3ff",
		accent: "#8b5cf6",
	},
];

type SettingsProperties = {
	isDark: boolean;
};

export const Settings = ({ isDark }: SettingsProperties): FunctionComponent => {
	const flavor = useAppStore((state) => state.flavor);
	const setFlavor = useAppStore((state) => state.setFlavor);
	const setTheme = useAppStore((state) => state.setTheme);
	const theme = useAppStore((state) => state.theme);
	const { i18n, t } = useTranslation();

	const headingClass = isDark ? "text-white" : "text-black";
	const panelClass = isDark
		? "border-neutral-800 bg-neutral-950"
		: "border-neutral-200 bg-neutral-50";
	const secondaryClass = isDark ? "text-neutral-400" : "text-neutral-500";
	const currentThemeOption = themeOptions.find(
		(option) => option.mode === theme && option.flavor === flavor
	);
	const currentThemeLabel = currentThemeOption
		? t(currentThemeOption.labelKey, {
				defaultValue: currentThemeOption.labelKey,
			})
		: t("settings.customTheme");

	return (
		<div className="space-y-6">
			<header>
				<h1 className={`font-heading text-2xl font-bold ${headingClass}`}>
					{t("settings.title")}
				</h1>
				<p className={`mt-1 text-sm ${secondaryClass}`}>{currentThemeLabel}</p>
				<p className={`mt-2 max-w-2xl text-sm leading-6 ${secondaryClass}`}>
					{t("settings.subtitle")}
				</p>
			</header>

			<section className="space-y-3">
				<h2 className={`text-sm font-semibold ${headingClass}`}>
					{t("settings.language")}
				</h2>
				<div className="flex flex-wrap gap-2">
					{locales.map((option) => {
						const selected = i18n.resolvedLanguage === option.code;

						return (
							<button
								key={option.code}
								aria-pressed={selected}
								type="button"
								className={`rounded-md border px-3 py-2 text-sm transition-colors ${
									selected
										? "theme-primary-selected"
										: `${panelClass} ${secondaryClass}`
								}`}
								onClick={(): void => {
									void i18n.changeLanguage(option.code);
								}}
							>
								{option.nativeName}
							</button>
						);
					})}
				</div>
			</section>

			<section className="space-y-3">
				<h2 className={`text-sm font-semibold ${headingClass}`}>
					{t("settings.theme")}
				</h2>
				<div className="grid gap-2 sm:grid-cols-3">
					{themeOptions.map((option) => {
						const selected = option.mode === theme && option.flavor === flavor;

						return (
							<button
								key={`${option.mode}-${option.flavor}-${option.labelKey}`}
								aria-pressed={selected}
								type="button"
								className={`group rounded-md border p-2 text-left transition-colors ${
									selected ? "theme-primary-border" : panelClass
								}`}
								onClick={(): void => {
									setTheme(option.mode);
									setFlavor(option.flavor);
								}}
							>
								<div
									className="overflow-hidden rounded border border-black/10"
									style={{ backgroundColor: option.background }}
								>
									<div className="flex h-14 items-center gap-2 p-2">
										<div
											className="h-8 w-8 rounded"
											style={{ backgroundColor: option.surface }}
										/>
										<div className="min-w-0 flex-1 space-y-2">
											<div
												className="h-2 w-3/4 rounded-full"
												style={{ backgroundColor: option.foreground }}
											/>
											<div
												className="h-2 w-1/2 rounded-full opacity-60"
												style={{ backgroundColor: option.foreground }}
											/>
										</div>
										<div
											className="h-5 w-5 rounded-full"
											style={{ backgroundColor: option.accent }}
										/>
									</div>
								</div>
								<div className="mt-2 flex items-center justify-between gap-2">
									<span className={`text-sm font-medium ${headingClass}`}>
										{t(option.labelKey, { defaultValue: option.labelKey })}
									</span>
									<span
										className={`flex h-5 w-5 items-center justify-center rounded-full ${
											selected
												? "theme-primary-badge"
												: "bg-secondary text-secondary-front"
										}`}
									>
										{selected ? <CheckIcon className="h-3.5 w-3.5" /> : null}
									</span>
								</div>
							</button>
						);
					})}
				</div>
			</section>
		</div>
	);
};
