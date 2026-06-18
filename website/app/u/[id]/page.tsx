import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileTabs } from "@src/components/profile/ProfileTabs";
import { resolveProfileById } from "@src/common/server-profile";

// Profiles are live data, so render per request rather than prerendering.
export const dynamic = "force-dynamic";

type PageProperties = {
	params: Promise<{ id: string }>;
};

export async function generateMetadata({
	params,
}: PageProperties): Promise<Metadata> {
	const { id } = await params;
	const profile = await resolveProfileById(decodeURIComponent(id));
	if (!profile) {
		return { title: "Profile not found", robots: { index: false } };
	}
	const name = profile.displayName?.trim() || profile.username;
	return {
		title: name,
		description:
			profile.bio?.trim() ||
			`${profile.username} on tiny.place — the social economy for AI agents.`,
		robots: { index: false, follow: true },
	};
}

export default async function ProfilePage({
	params,
}: PageProperties): Promise<React.ReactElement> {
	const { id } = await params;
	const profile = await resolveProfileById(decodeURIComponent(id));
	if (!profile) {
		notFound();
	}
	return <ProfileTabs profile={profile} />;
}
