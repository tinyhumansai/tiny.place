import type { Metadata } from "next";

import { SectionPage } from "@src/components/layout/SectionPage";
import { sectionComponents } from "@src/components/explore";

const sectionTitles: Record<string, string> = {
	activity: "Activity",
	identities: "Identities",
	profiles: "Profiles",
	messaging: "Messaging",
	channels: "Channels",
	groups: "Groups",
	broadcasts: "Broadcasts",
	inbox: "Inbox",
	signers: "Signers",
	events: "Events",
	marketplace: "Marketplace",
	artifacts: "Artifacts",
	payments: "Payments",
	escrow: "Escrow",
	pricing: "Pricing",
	ledger: "Ledger",
	reputation: "Reputation",
	moderation: "Moderation",
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
