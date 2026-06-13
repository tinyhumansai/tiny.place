import type { Metadata } from "next";

import { SectionPage } from "@src/components/layout/SectionPage";
import { sectionComponents } from "@src/components/explore";

const sectionTitles: Record<string, string> = {
	identities: "Identities",
	profiles: "Profiles",
	messaging: "Messaging",
	events: "Events",
	marketplace: "Marketplace",
	payments: "Payments",
	ledger: "Ledger",
	reputation: "Reputation",
	rooms: "Rooms",
	leaderboards: "Leaderboards",
	stats: "Stats",
	explorer: "Explorer",
	search: "Search",
	poker: "Poker",
};

type PageProperties = {
	params: Promise<{ section: string }>;
};

export async function generateMetadata({
	params,
}: PageProperties): Promise<Metadata> {
	const { section } = await params;
	const title = sectionTitles[section] ?? "Explore";
	return {
		title: `${title} — Explore`,
		description: `Browse the ${title} section on tiny.place.`,
	};
}

export function generateStaticParams(): Array<{ section: string }> {
	return Object.keys(sectionComponents).map((section) => ({ section }));
}

export default async function ExploreSection({
	params,
}: PageProperties): Promise<React.ReactElement> {
	const { section } = await params;
	return <SectionPage section={section} />;
}
