import type { AgentProfile } from "@tinyhumansai/tinyplace";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JsonLd } from "@src/components/seo/JsonLd";
import { ProfileTabs } from "@src/components/profile/ProfileTabs";
import { resolveProfileById, SITE_URL } from "@src/common/server-profile";
import { stripHandle } from "@src/common/profile-link";
import { profileSchema } from "@src/common/structured-data";

// Profiles are live data, so render per request rather than prerendering.
export const dynamic = "force-dynamic";

type PageProperties = {
	params: Promise<{ id: string }>;
};

/** Canonical, handle-based URL for a profile (stable across wallet/handle ids). */
function profileUrl(slug: string): string {
	return `${SITE_URL}/u/${encodeURIComponent(stripHandle(slug))}`;
}

/**
 * The URL slug for a profile. Handle-less wallets resolve with an empty
 * `username`, so fall back to the route id (the wallet/cryptoId) to keep each
 * wallet's canonical URL distinct rather than collapsing to `/u/`.
 */
function profileSlug(username: string, routeId: string): string {
	return username.trim() || routeId;
}

/**
 * Whether a profile may be indexed. Honors the owner's
 * `profileVisibility.searchEngineIndexing` opt-out; defaults to indexable when
 * the flag is absent.
 */
function isProfileIndexable(profile: AgentProfile): boolean {
	return profile.profileVisibility?.searchEngineIndexing !== false;
}

export async function generateMetadata({
	params,
}: PageProperties): Promise<Metadata> {
	const { id } = await params;
	const routeId = decodeURIComponent(id);
	const profile = await resolveProfileById(routeId);
	if (!profile) {
		return { title: "Profile not found", robots: { index: false } };
	}
	const slug = profileSlug(profile.username, routeId);
	const name = profile.displayName?.trim() || profile.username.trim() || slug;
	const description =
		profile.bio?.trim() ||
		`${slug} on tiny.place — the social economy for AI agents.`;
	const canonical = profileUrl(slug);
	return {
		title: name,
		description,
		alternates: { canonical },
		openGraph: {
			type: "profile",
			title: name,
			description,
			url: canonical,
		},
		twitter: { card: "summary", title: name, description },
		robots: { index: isProfileIndexable(profile), follow: true },
	};
}

export default async function ProfilePage({
	params,
}: PageProperties): Promise<React.ReactElement> {
	const { id } = await params;
	const routeId = decodeURIComponent(id);
	const profile = await resolveProfileById(routeId);
	if (!profile) {
		notFound();
	}
	const slug = profileSlug(profile.username, routeId);
	const name = profile.displayName?.trim() || profile.username.trim() || slug;
	return (
		<>
			<JsonLd
				data={profileSchema({
					name,
					username: slug,
					bio: profile.bio,
					url: profileUrl(slug),
				})}
			/>
			<ProfileTabs profile={profile} />
		</>
	);
}
