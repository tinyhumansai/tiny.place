"use client";

import { CheckIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { useAppStore } from "@src/store/app";

type ThemeMode = "light" | "dark";
type ThemeFlavor = "default" | "dark-blue" | "green" | "mint" | "violet";

type ThemeOption = {
	accent: string;
	background: string;
	flavor: ThemeFlavor;
	foreground: string;
	label: string;
	mode: ThemeMode;
	surface: string;
};

type LanguageOption = {
	code: "en" | "es";
	label: string;
};

const languageOptions: Array<LanguageOption> = [
	{ code: "en", label: "English" },
	{ code: "es", label: "Español" },
];

const themeOptions: Array<ThemeOption> = [
	{
		label: "Dark",
		mode: "dark",
		flavor: "default",
		background: "#050505",
		surface: "#171717",
		foreground: "#fafafa",
		accent: "#2563eb",
	},
	{
		label: "Light",
		mode: "light",
		flavor: "default",
		background: "#ffffff",
		surface: "#f5f5f5",
		foreground: "#111111",
		accent: "#111111",
	},
	{
		label: "Green",
		mode: "light",
		flavor: "green",
		background: "#f7fdf9",
		surface: "#dcfce7",
		foreground: "#052e1a",
		accent: "#047857",
	},
	{
		label: "Dark Green",
		mode: "dark",
		flavor: "green",
		background: "#02130d",
		surface: "#073526",
		foreground: "#ecfdf5",
		accent: "#10b981",
	},
	{
		label: "Dark Blue",
		mode: "dark",
		flavor: "dark-blue",
		background: "#020617",
		surface: "#0f172a",
		foreground: "#e0f2fe",
		accent: "#38bdf8",
	},
	{
		label: "Mint",
		mode: "light",
		flavor: "mint",
		background: "#f0fdfa",
		surface: "#99f6e4",
		foreground: "#042f2e",
		accent: "#0f766e",
	},
	{
		label: "Violet",
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
	const { i18n } = useTranslation();

	const headingClass = isDark ? "text-white" : "text-black";
	const panelClass = isDark
		? "border-neutral-800 bg-neutral-950"
		: "border-neutral-200 bg-neutral-50";
	const secondaryClass = isDark ? "text-neutral-400" : "text-neutral-500";
	const currentTheme =
		themeOptions.find(
			(option) => option.mode === theme && option.flavor === flavor,
		)?.label ?? "Custom";

	return (
		<div className="space-y-6">
			<header>
				<h1 className={`font-heading text-2xl font-bold ${headingClass}`}>
					Settings
				</h1>
				<p className={`mt-1 text-sm ${secondaryClass}`}>{currentTheme}</p>
			</header>

			<section className="space-y-3">
				<h2 className={`text-sm font-semibold ${headingClass}`}>Language</h2>
				<div className="flex flex-wrap gap-2">
					{languageOptions.map((option) => {
						const selected = i18n.resolvedLanguage === option.code;

						return (
							<button
								key={option.code}
								aria-pressed={selected}
								className={`rounded-md border px-3 py-2 text-sm transition-colors ${
									selected
										? "border-primary bg-primary text-primary-front"
										: `${panelClass} ${secondaryClass}`
								}`}
								type="button"
								onClick={(): void => {
									void i18n.changeLanguage(option.code);
								}}
							>
								{option.label}
							</button>
						);
					})}
				</div>
			</section>

			<section className="space-y-3">
				<h2 className={`text-sm font-semibold ${headingClass}`}>Theme</h2>
				<div className="grid gap-3 sm:grid-cols-2">
					{themeOptions.map((option) => {
						const selected = option.mode === theme && option.flavor === flavor;

						return (
							<button
								key={`${option.mode}-${option.flavor}-${option.label}`}
								aria-pressed={selected}
								className={`group rounded-lg border p-3 text-left transition-colors ${
									selected ? "border-primary" : panelClass
								}`}
								type="button"
								onClick={(): void => {
									setTheme(option.mode);
									setFlavor(option.flavor);
								}}
							>
								<div
									className="overflow-hidden rounded-md border border-black/10"
									style={{ backgroundColor: option.background }}
								>
									<div className="flex h-20 items-center gap-2 p-3">
										<div
											className="h-10 w-10 rounded"
											style={{ backgroundColor: option.surface }}
										/>
										<div className="min-w-0 flex-1 space-y-2">
											<div
												className="h-2.5 w-3/4 rounded-full"
												style={{ backgroundColor: option.foreground }}
											/>
											<div
												className="h-2.5 w-1/2 rounded-full opacity-60"
												style={{ backgroundColor: option.foreground }}
											/>
										</div>
										<div
											className="h-7 w-7 rounded-full"
											style={{ backgroundColor: option.accent }}
										/>
									</div>
								</div>
								<div className="mt-3 flex items-center justify-between gap-3">
									<span className={`text-sm font-medium ${headingClass}`}>
										{option.label}
									</span>
									<span
										className={`flex h-5 w-5 items-center justify-center rounded-full ${
											selected
												? "bg-primary text-primary-front"
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
