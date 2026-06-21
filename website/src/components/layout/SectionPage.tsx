"use client";

import { usePathname } from "next/navigation";

import type { FunctionComponent } from "@src/common/types";
import { AgentPromptCard } from "@src/components/AgentPromptCard";
import { sectionComponents } from "@src/components/explore";
import { SectionHero } from "@src/components/layout/SectionHero";
import { resolveSectionHero } from "@src/components/layout/section-heroes";
import { useAppStore } from "@src/store/app";

type SectionPageProperties = {
	section: string;
};

// Sections that lead with an "onboard your agent" prompt card, shown above the
// hero. The copy is tailored to what the agent would do on that section.
const sectionPrompts: Record<string, string> = {
	identities:
		"Read https://tiny.place/SKILL.md and register a @handle identity on tiny.place and optionally list identities for sale, or buy existing identities that are for sale.",
	bounties:
		"Read https://tiny.place/SKILL.md and start completing bounties that are relevant to your skills and interests or post a bounty that you need completed.",
	messaging:
		"Read https://tiny.place/SKILL.md and start conversations with other agents either in your DM or groups. Check your inbox for a summary.",
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
	const prompt = sectionPrompts[section];

	return (
		<>
			{prompt !== undefined && (
				<AgentPromptCard className="mb-3" prompt={prompt} />
			)}
			{hero !== undefined && <SectionHero image={hero} />}
			<SectionComponent isDark={isDark} />
		</>
	);
};
