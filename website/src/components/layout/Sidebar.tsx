"use client";

import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { type ComponentType, type SVGProps, useState } from "react";

import type { FunctionComponent } from "@src/common/types";

type Section = {
	icon?: ComponentType<SVGProps<SVGSVGElement>>;
	key: string;
	label: string;
};

type ExternalLink = {
	href: string;
	label: string;
};

const externalLinks: Array<ExternalLink> = [
	{ href: "https://tinyhumans.gitbook.io/tiny.place/", label: "Docs" },
	{ href: "https://discord.tinyhumans.ai/", label: "Discord" },
	{
		href: "https://x.com/intent/follow?screen_name=tinyhumansai",
		label: "Twitter",
	},
];

type SidebarProps = {
	activeSection: string;
	isDark: boolean;
	sections: Array<Section>;
};

type NavContentProps = SidebarProps & {
	onNavigate?: () => void;
};

const NavContent = ({
	activeSection,
	isDark,
	sections,
	onNavigate,
}: NavContentProps): FunctionComponent => {
	const inactiveClasses = isDark
		? "text-neutral-500 hover:text-neutral-300"
		: "text-neutral-500 hover:text-neutral-700";

	return (
		<nav className="flex flex-1 flex-col px-2 py-2">
			{sections.map((section) => {
				const isActive = section.key === activeSection;
				const Icon = section.icon;
				return (
					<Link
						key={section.key}
						href={`/${section.key}`}
						className={`flex items-center gap-2 text-left text-xs px-2 py-1.5 rounded transition-colors ${
							isActive
								? isDark
									? "text-white bg-neutral-800"
									: "text-black bg-neutral-200"
								: inactiveClasses
						}`}
						onClick={onNavigate}
					>
						{Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
						{section.label}
					</Link>
				);
			})}
			<div
				className={`my-2 border-t ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
			/>
			{externalLinks.map((link) => (
				<a
					key={link.label}
					className={`flex items-center gap-2 text-left text-xs px-2 py-1.5 rounded transition-colors ${inactiveClasses}`}
					href={link.href}
					rel="noreferrer"
					target="_blank"
					onClick={onNavigate}
				>
					{link.label}
				</a>
			))}
		</nav>
	);
};

export const Sidebar = ({
	activeSection,
	isDark,
	sections,
}: SidebarProps): FunctionComponent => {
	const [isOpen, setIsOpen] = useState(false);
	const openMenu = (): void => {
		setIsOpen(true);
	};
	const closeMenu = (): void => {
		setIsOpen(false);
	};

	const surfaceClasses = isDark
		? "border-neutral-800 bg-neutral-950"
		: "border-neutral-200 bg-neutral-50";
	const brandClasses = isDark ? "text-white" : "text-black";

	const brand = (
		<Link
			className={`font-heading text-sm font-bold tracking-tight ${brandClasses}`}
			href="/"
			onClick={closeMenu}
		>
			tiny.place
		</Link>
	);

	return (
		<>
			{/* Mobile: hamburger toggle (hidden on md and up) */}
			<button
				aria-label="Open menu"
				type="button"
				className={`md:hidden fixed left-2 top-2 z-30 p-2 rounded border transition-colors ${
					isDark
						? "border-neutral-700 bg-neutral-950 text-neutral-300"
						: "border-neutral-300 bg-neutral-50 text-neutral-700"
				}`}
				onClick={openMenu}
			>
				<Bars3Icon className="h-5 w-5" />
			</button>

			{/* Mobile: slide-in drawer + backdrop */}
			{isOpen && (
				<div className="md:hidden fixed inset-0 z-40 flex">
					<button
						aria-label="Close menu"
						className="absolute inset-0 bg-black/50"
						type="button"
						onClick={closeMenu}
					/>
					<aside
						className={`relative flex w-48 flex-col min-h-screen border-r overflow-y-auto ${surfaceClasses}`}
					>
						<div
							className={`sticky top-0 z-10 flex h-[51px] items-center justify-between px-3 border-b ${surfaceClasses}`}
						>
							{brand}
							<button
								aria-label="Close menu"
								className={`p-1 rounded ${isDark ? "text-neutral-400 hover:text-white" : "text-neutral-500 hover:text-black"}`}
								type="button"
								onClick={closeMenu}
							>
								<XMarkIcon className="h-5 w-5" />
							</button>
						</div>
						<NavContent
							activeSection={activeSection}
							isDark={isDark}
							sections={sections}
							onNavigate={closeMenu}
						/>
					</aside>
				</div>
			)}

			{/* Desktop: static sidebar (hidden below md) */}
			<aside
				className={`hidden md:flex flex-col w-48 shrink-0 min-h-screen border-r overflow-y-auto ${surfaceClasses}`}
			>
				<div
					className={`sticky top-0 z-10 flex h-[51px] items-center px-3 border-b ${surfaceClasses}`}
				>
					{brand}
				</div>
				<NavContent
					activeSection={activeSection}
					isDark={isDark}
					sections={sections}
				/>
			</aside>
		</>
	);
};
