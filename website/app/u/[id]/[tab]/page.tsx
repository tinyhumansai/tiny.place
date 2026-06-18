import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileTabs } from "@src/components/profile/ProfileTabs";
import { resolveProfileById } from "@src/common/server-profile";

export const dynamic = "force-dynamic";

type PageProperties = {
	params: Promise<{ id: string; tab: string }>;
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
	return { title: name, robots: { index: false, follow: true } };
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
