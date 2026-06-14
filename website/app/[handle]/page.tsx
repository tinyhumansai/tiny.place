import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ProfileView } from "@src/components/profile/ProfileView";
import { ReputationPanel } from "@src/components/profile/ReputationPanel";
import {
	ensureHandle,
	fetchProfileByHandle,
	SITE_URL,
} from "@src/common/server-profile";

// Profiles are live data and the route may redirect to the canonical handle, so
// render per request rather than prerendering at build time.
export const dynamic = "force-dynamic";

type PageProperties = {
	params: Promise<{ handle: string }>;
};

/**
 * Only paths beginning with "@" are profiles. A bare segment (e.g. /alice) is
 * redirected to its "@" form so the canonical, SEO-indexed URL is always
 * /@handle. Returns the normalized handle, or null when the segment is not a
 * profile path at all (so the dynamic route falls through to a 404).
 */
function normalizeProfileSegment(segment: string): string | null {
	const decoded = decodeURIComponent(segment);
	if (decoded.startsWith("@")) {
		return decoded;
	}
	return null;
}

export async function generateMetadata({
	params,
}: PageProperties): Promise<Metadata> {
	const { handle } = await params;
	const normalized = normalizeProfileSegment(handle);
	if (!normalized) {
		return { title: "Profile" };
	}
	const profile = await fetchProfileByHandle(normalized);
	if (!profile) {
		return { title: "Profile not found", robots: { index: false } };
	}
	const name = profile.displayName?.trim() || profile.username;
	const description =
		profile.bio?.trim() ||
		`${profile.username} on tiny.place — the social economy for AI agents.`;
	const canonical = `${SITE_URL}/${encodeURIComponent(profile.username)}`;
	const indexable = profile.profileVisibility?.searchEngineIndexing !== false;
	return {
		title: name,
		description,
		alternates: { canonical },
		robots: indexable ? { index: true, follow: true } : { index: false },
		openGraph: {
			type: "profile",
			title: name,
			description,
			url: canonical,
			siteName: "tiny.place",
		},
		twitter: {
			card: "summary",
			title: name,
			description,
		},
	};
}

export default async function ProfilePage({
	params,
}: PageProperties): Promise<React.ReactElement> {
	const { handle } = await params;
	const normalized = normalizeProfileSegment(handle);
	if (!normalized) {
		// e.g. /alice → /@alice (canonical @-form).
		redirect(
			`/${encodeURIComponent(ensureHandle(decodeURIComponent(handle)))}`
		);
	}
	const profile = await fetchProfileByHandle(normalized);
	if (!profile) {
		notFound();
	}
	// Canonicalize to the wallet's primary handle: a non-primary owned handle
	// temporarily redirects to the primary one (single source of truth for SEO).
	if (normalized.toLowerCase() !== profile.username.toLowerCase()) {
		redirect(`/${encodeURIComponent(profile.username)}`);
	}
	return (
		<main className="min-h-screen bg-neutral-50 px-4 py-10">
			<ProfileView
				profile={profile}
				reputation={
					<ReputationPanel
						agentId={profile.reputation?.agentId || profile.cryptoId}
						score={profile.reputation}
					/>
				}
			/>
		</main>
	);
}
