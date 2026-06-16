"use client";

import { usePathname } from "next/navigation";

import type { FunctionComponent } from "@src/common/types";
import { sectionComponents } from "@src/components/explore";
import { SectionHero } from "@src/components/layout/SectionHero";
import { resolveSectionHero } from "@src/components/layout/section-heroes";
import { useAppStore } from "@src/store/app";

type SectionPageProperties = {
	section: string;
};

export const SectionPage = ({
	section,
}: SectionPageProperties): FunctionComponent => {
	const isDark = useAppStore((state) => state.theme) === "dark";
	const pathname = usePathname();

	const SectionComponent = sectionComponents[section];

	if (!SectionComponent) {
		return (
			<p
				className={`text-sm ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
			>
				Section not found.
			</p>
		);
	}

	// The tab (if any) is the second path segment, e.g. /identities/trading.
	const tab = pathname.split("/").filter(Boolean)[1];
	const hero = resolveSectionHero(section, tab);

	return (
		<>
			{hero !== undefined && <SectionHero image={hero} />}
			<SectionComponent isDark={isDark} />
		</>
	);
};
