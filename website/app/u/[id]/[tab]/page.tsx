import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileTabs } from "@src/components/profile/ProfileTabs";
import { resolveProfileById, SITE_URL } from "@src/common/server-profile";
import { stripHandle } from "@src/common/profile-link";

export const dynamic = "force-dynamic";

type PageProperties = {
	params: Promise<{ id: string; tab: string }>;
};

export async function generateMetadata({
	params,
}: PageProperties): Promise<Metadata> {
	const { id } = await params;
	const routeId = decodeURIComponent(id);
	const profile = await resolveProfileById(routeId);
	if (!profile) {
		return { title: "Profile not found", robots: { index: false } };
	}
	// Handle-less wallets resolve with an empty username; fall back to the route
	// id so the canonical stays distinct rather than collapsing to `/u/`.
	const slug = profile.username.trim() || routeId;
	const name = profile.displayName?.trim() || profile.username.trim() || slug;
	// Tabs share the profile's content, so point the canonical at the base
	// profile URL to consolidate ranking signals and avoid duplicate content.
	// Honor the owner's search-indexing opt-out (defaults to indexable).
	const indexable = profile.profileVisibility?.searchEngineIndexing !== false;
	return {
		title: name,
		alternates: {
			canonical: `${SITE_URL}/u/${encodeURIComponent(stripHandle(slug))}`,
		},
		robots: { index: indexable, follow: true },
	};
}

// The open tab lives in the URL (e.g. /u/alice/handles); ProfileTabs reads it
// from the path, so this route renders the same profile view.
export default async function ProfileTabPage({
	params,
}: PageProperties): Promise<React.ReactElement> {
	const { id } = await params;
	const profile = await resolveProfileById(decodeURIComponent(id));
	if (!profile) {
		notFound();
	}
	return <ProfileTabs profile={profile} />;
}
