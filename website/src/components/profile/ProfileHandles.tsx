"use client";

import type { AgentProfile } from "@tinyhumansai/tinyplace";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";

import { ProfileEntityLink } from "./EntityLink";

type ProfileHandlesProperties = {
	profile: AgentProfile;
	isDark?: boolean;
};

function themeClasses(isDark: boolean): {
	surface: string;
	innerBorder: string;
	heading: string;
	primary: string;
	muted: string;
} {
	return isDark
		? {
				surface: "border-neutral-800 bg-neutral-950",
				innerBorder: "border-neutral-800",
				heading: "text-neutral-100",
				primary: "text-white",
				muted: "text-neutral-500",
			}
		: {
				surface: "border-neutral-200 bg-white",
				innerBorder: "border-neutral-100",
				heading: "text-neutral-900",
				primary: "text-neutral-900",
				muted: "text-neutral-400",
			};
}

export function ProfileHandles({
	profile,
	isDark = false,
}: ProfileHandlesProperties): ReactElement {
	const { t } = useTranslation();
	const handles = profile.assets ?? [];
	const theme = themeClasses(isDark);

	return (
		<section className={`rounded-lg border p-4 ${theme.surface}`}>
			<h2
				className={`mb-3 flex items-baseline gap-2 text-sm font-medium ${theme.heading}`}
			>
				{t("profile.handles.title")}
				<span className={`text-xs font-normal ${theme.muted}`}>
					{handles.length}
				</span>
			</h2>
			{handles.length === 0 ? (
				<p className={`text-sm ${theme.muted}`}>{t("profile.handles.empty")}</p>
			) : (
				<ul className="flex flex-col gap-2">
					{handles.map((handle) => (
						<li
							key={handle.name}
							className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${theme.innerBorder}`}
						>
							<span className="min-w-0">
								<ProfileEntityLink
									className={`font-medium hover:underline ${theme.primary}`}
									value={handle.name}
								>
									{handle.name}
								</ProfileEntityLink>
							</span>
							<span
								className={`flex shrink-0 items-center gap-2 text-xs ${theme.muted}`}
							>
								{handle.primary && (
									<span className="rounded-full bg-blue-500/10 px-2 py-0.5 font-medium text-blue-500">
										{t("profile.handles.primary")}
									</span>
								)}
								<span>{handle.status}</span>
								<ProfileEntityLink
									value={handle.name}
									className={`rounded-md border px-2 py-1 font-medium transition-colors ${
										isDark
											? "border-neutral-700 text-neutral-300 hover:bg-neutral-900"
											: "border-neutral-200 text-neutral-700 hover:bg-neutral-100"
									}`}
								>
									{t("profile.handles.view")}
								</ProfileEntityLink>
							</span>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
