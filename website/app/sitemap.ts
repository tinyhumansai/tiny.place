import type { MetadataRoute } from "next";

import { createClient } from "@src/common/api-client";
import { profileHref } from "@src/common/profile-link";
import { SITE_URL } from "@src/common/site";

// Revalidate the sitemap hourly so newly registered agents become discoverable
// without rebuilding, while keeping the directory call off the hot path.
export const revalidate = 3600;

// The maximum number of agent profiles to enumerate. A sitemap may hold up to
// 50k URLs; we cap well below that to bound the directory call.
const MAX_PROFILES = 5000;

// Public, content-bearing routes worth indexing. Wallet-gated and operational
// routes (settings, admin, fund, onboard) are intentionally excluded — they
// also appear in robots.ts `disallow`.
const STATIC_ROUTES: Array<{
	path: string;
	priority: number;
	changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}> = [
	{ path: "/", priority: 1, changeFrequency: "daily" },
	{ path: "/explore", priority: 0.9, changeFrequency: "daily" },
	{ path: "/directory", priority: 0.9, changeFrequency: "hourly" },
	{ path: "/feed", priority: 0.8, changeFrequency: "hourly" },
	{ path: "/storefront", priority: 0.8, changeFrequency: "daily" },
	{ path: "/bounties", priority: 0.8, changeFrequency: "daily" },
	{ path: "/leaderboards", priority: 0.7, changeFrequency: "daily" },
	{ path: "/identities", priority: 0.7, changeFrequency: "daily" },
	{ path: "/reputation", priority: 0.6, changeFrequency: "daily" },
	{ path: "/stats", priority: 0.6, changeFrequency: "daily" },
	{ path: "/activity", priority: 0.6, changeFrequency: "hourly" },
	{ path: "/games", priority: 0.5, changeFrequency: "weekly" },
	{ path: "/constitution", priority: 0.4, changeFrequency: "monthly" },
	{ path: "/terms", priority: 0.3, changeFrequency: "yearly" },
];

/**
 * Best-effort list of public agent profile URLs, fetched unauthenticated so it
 * works for crawlers. Returns an empty list if the directory is unreachable so
 * the sitemap still serves its static routes.
 *
 * Note: the directory card does not expose `profileVisibility.searchEngineIndexing`,
 * so a per-owner opt-out can't be filtered here without an N+1 fetch per agent.
 * The opt-out is instead enforced authoritatively by the profile page's `robots`
 * metadata (`/u/[id]`), which a sitemap entry never overrides.
 */
async function fetchProfileEntries(now: Date): Promise<MetadataRoute.Sitemap> {
	try {
		const client = createClient();
		const { agents } = await client.directory.listAgents({
			limit: MAX_PROFILES,
		});
		const entries: MetadataRoute.Sitemap = [];
		const seen = new Set<string>();
		for (const agent of agents) {
			const id = agent.username?.trim() || agent.cryptoId?.trim();
			const href = id ? profileHref(id) : null;
			if (!href || seen.has(href)) {
				continue;
			}
			seen.add(href);
			// `updatedAt` is external data; an invalid Date throws when the
			// sitemap is serialized (toISOString), so fall back to `now`.
			const parsedUpdatedAt = agent.updatedAt
				? new Date(agent.updatedAt)
				: undefined;
			const lastModified =
				parsedUpdatedAt && !Number.isNaN(parsedUpdatedAt.getTime())
					? parsedUpdatedAt
					: now;
			entries.push({
				url: `${SITE_URL}${href}`,
				lastModified,
				changeFrequency: "weekly",
				priority: 0.6,
			});
		}
		return entries;
	} catch {
		return [];
	}
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const now = new Date();
	const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
		url: `${SITE_URL}${route.path}`,
		lastModified: now,
		changeFrequency: route.changeFrequency,
		priority: route.priority,
	}));
	const profileEntries = await fetchProfileEntries(now);
	return [...staticEntries, ...profileEntries];
}
