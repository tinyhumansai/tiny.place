"use client";

import type { CSSProperties } from "react";

import { heroImageUrl } from "@src/components/layout/section-heroes";
import type { FunctionComponent } from "@src/common/types";

type SectionHeroProperties = {
	image: string;
};

/**
 * A small, very horizontal banner showing a section's GitBook hero artwork. The
 * image is served from GitHub's raw CDN and is purely decorative — the page content
 * carries the accessible meaning — so it is hidden from assistive tech. A soft
 * gradient overlay keeps it legible against the page chrome in both dark and
 * light themes.
 *
 * The leading space above the banner is tightened by `ExploreShell` (which
 * reduces its top padding when a section has a hero); sections without one keep
 * the larger blank gap, so no spacing is applied here.
 */
export const SectionHero = ({
	image,
}: SectionHeroProperties): FunctionComponent => {
	const style: CSSProperties = {
		backgroundImage: `url('${heroImageUrl(image)}')`,
	};

	return (
		<div
			aria-hidden
			className="hero-pan relative mb-6 h-28 w-full overflow-hidden rounded-xl border border-border bg-surface bg-cover sm:h-32"
			style={style}
		>
			<div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
		</div>
	);
};
