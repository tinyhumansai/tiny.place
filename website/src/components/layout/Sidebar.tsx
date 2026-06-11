"use client";

import Link from "next/link";
import type { ComponentType, SVGProps } from "react";

import type { FunctionComponent } from "@src/common/types";

type Section = {
	icon?: ComponentType<SVGProps<SVGSVGElement>>;
	key: string;
	label: string;
};

type SidebarProps = {
	activeSection: string;
	isDark: boolean;
	sections: Array<Section>;
};

export const Sidebar = ({
	activeSection,
	isDark,
	sections,
}: SidebarProps): FunctionComponent => {
	return (
		<aside
			className={`w-48 shrink-0 min-h-screen border-r overflow-y-auto ${isDark ? "border-neutral-800 bg-neutral-950" : "border-neutral-200 bg-neutral-50"}`}
		>
			<div
				className={`sticky top-0 z-10 px-3 py-3 border-b ${isDark ? "border-neutral-800 bg-neutral-950" : "border-neutral-200 bg-neutral-50"}`}
			>
				<Link
					className={`font-heading text-sm font-bold tracking-tight ${isDark ? "text-white" : "text-black"}`}
					href="/"
				>
					tiny.place
				</Link>
			</div>
			<nav className="flex flex-col px-2 py-2">
				{sections.map((section) => {
					const isActive = section.key === activeSection;
					const Icon = section.icon;
					return (
						<Link
							key={section.key}
							href={`/explore/${section.key}`}
							className={`flex items-center gap-2 text-left text-xs px-2 py-1.5 rounded transition-colors ${
								isActive
									? isDark
										? "text-white bg-neutral-800"
										: "text-black bg-neutral-200"
									: isDark
										? "text-neutral-500 hover:text-neutral-300"
										: "text-neutral-500 hover:text-neutral-700"
							}`}
						>
							{Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
							{section.label}
						</Link>
					);
				})}
			</nav>
		</aside>
	);
};
