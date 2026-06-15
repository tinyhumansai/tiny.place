"use client";

import {
	Bars3Icon,
	ChatBubbleOvalLeftEllipsisIcon,
	Cog6ToothIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { type ComponentType, type SVGProps, useState } from "react";

import type { FunctionComponent } from "@src/common/types";

type Section = {
	href?: string;
	icon?: ComponentType<SVGProps<SVGSVGElement>>;
	key: string;
	label: string;
};

type BrandIcon = (props: SVGProps<SVGSVGElement>) => FunctionComponent;

const DocumentationIcon: BrandIcon = (props) => (
	<svg fill="currentColor" viewBox="0 0 24 24" {...props}>
		<path d="M10.802 17.77a.703.703 0 1 1-.002 1.406.703.703 0 0 1 .002-1.406m11.024-4.347a.703.703 0 1 1 .001-1.406.703.703 0 0 1-.001 1.406m0-2.876a2.176 2.176 0 0 0-2.174 2.174c0 .233.039.465.115.691l-7.181 3.823a2.165 2.165 0 0 0-1.784-.937c-.829 0-1.584.475-1.95 1.216l-6.451-3.402c-.682-.358-1.192-1.48-1.138-2.502.028-.533.212-.947.493-1.107.178-.1.392-.092.62.027l.042.023c1.71.9 7.304 3.847 7.54 3.956.363.168.565.237 1.185-.057l11.564-6.014c.17-.064.368-.227.368-.474 0-.342-.354-.477-.355-.477-.658-.315-1.669-.788-2.655-1.25-2.108-.987-4.497-2.105-5.546-2.655-.906-.474-1.635-.074-1.765.006l-.252.125C7.78 6.048 1.46 9.178 1.1 9.397.457 9.789.058 10.57.006 11.539c-.08 1.537.703 3.14 1.824 3.727l6.822 3.518a2.175 2.175 0 0 0 2.15 1.862 2.177 2.177 0 0 0 2.173-2.14l7.514-4.073c.38.298.853.461 1.337.461A2.176 2.176 0 0 0 24 12.72a2.176 2.176 0 0 0-2.174-2.174" />
	</svg>
);

const DiscordIcon: BrandIcon = (props) => (
	<svg fill="currentColor" viewBox="0 0 24 24" {...props}>
		<path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
	</svg>
);

const XIcon: BrandIcon = (props) => (
	<svg fill="currentColor" viewBox="0 0 24 24" {...props}>
		<path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
	</svg>
);

const GithubIcon: BrandIcon = (props) => (
	<svg fill="currentColor" viewBox="0 0 24 24" {...props}>
		<path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
	</svg>
);

type ExternalLink = {
	href: string;
	icon: BrandIcon;
	label: string;
};

const externalLinks: Array<ExternalLink> = [
	{
		href: "https://tinyhumans.gitbook.io/tiny.place/",
		icon: DocumentationIcon,
		label: "Docs",
	},
	{
		href: "https://discord.tinyhumans.ai/",
		icon: DiscordIcon,
		label: "Discord",
	},
	{
		href: "https://x.com/intent/follow?screen_name=tinyhumansai",
		icon: XIcon,
		label: "X",
	},
	{
		href: "https://github.com/tinyhumansai/tiny.place",
		icon: GithubIcon,
		label: "GitHub",
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
						href={section.href ?? `/${section.key}`}
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
			{externalLinks.map((link) => {
				const Icon = link.icon;
				return (
					<a
						key={link.label}
						className={`flex items-center gap-2 text-left text-xs px-2 py-1.5 rounded transition-colors ${inactiveClasses}`}
						href={link.href}
						rel="noreferrer"
						target="_blank"
						onClick={onNavigate}
					>
						<Icon className="h-3.5 w-3.5 shrink-0" />
						{link.label}
					</a>
				);
			})}
			<Link
				href="/feedback"
				className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
					activeSection === "feedback"
						? isDark
							? "bg-neutral-800 text-white"
							: "bg-neutral-200 text-black"
						: inactiveClasses
				}`}
				onClick={onNavigate}
			>
				<ChatBubbleOvalLeftEllipsisIcon className="h-3.5 w-3.5 shrink-0" />
				Feedback
			</Link>
			<Link
				href="/settings"
				className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
					activeSection === "settings"
						? isDark
							? "bg-neutral-800 text-white"
							: "bg-neutral-200 text-black"
						: inactiveClasses
				}`}
				onClick={onNavigate}
			>
				<Cog6ToothIcon className="h-3.5 w-3.5 shrink-0" />
				Settings
			</Link>
			<div
				className={`my-2 border-t ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
			/>
			<p className={`px-2 pb-2 text-center text-xs ${inactiveClasses}`}>
				Need an Agent?
			</p>
			<a
				className="theme-primary-action rounded-md px-2 py-2 text-center text-xs font-medium transition-colors"
				href="https://tinyhumans.ai/openhuman"
				rel="noreferrer"
				target="_blank"
				onClick={onNavigate}
			>
				Try OpenHuman
			</a>
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
				className={`hidden md:flex flex-col w-48 shrink-0 h-screen border-r overflow-y-auto ${surfaceClasses}`}
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
