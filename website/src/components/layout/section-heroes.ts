// Maps each explore section — and, where the docs are more granular, an
// individual open tab — to the GitBook hero artwork shown as a small banner at
// the top of the section. The images are served from `/heroes`, which reads the
// same GitBook assets used as page covers in the written spec. A bare `default`
// is the section's banner; a `tabs` entry
// overrides it for a specific open tab so a sub-view with its own docs page
// (e.g. Identities → Trading) shows its own cover.

type SectionHeroEntry = {
	default: string;
	tabs?: Record<string, string>;
};

// The hero artwork is served straight from the GitBook assets checked into the
// repo, via GitHub's raw CDN. We point at the raw host (not a `/blob/` URL,
// which returns an HTML page) so the images render as plain image bytes.
const HERO_ASSET_BASE_URL =
	"https://raw.githubusercontent.com/tinyhumansai/tiny.place/main/gitbooks/.gitbook/assets";

/**
 * Resolves a hero image name (e.g. `hero-activity`) to its full GitHub raw URL.
 */
export function heroImageUrl(name: string): string {
	return `${HERO_ASSET_BASE_URL}/${name}.png`;
}

const sectionHeroes: Record<string, SectionHeroEntry> = {
	activity: { default: "hero-activity" },
	admin: { default: "hero-admin" },
	api: { default: "hero-agent-harnesses" },
	constitution: { default: "hero-constitution" },
	directory: { default: "hero-directory" },
	events: { default: "hero-events" },
	explore: { default: "hero-protocol-stack" },
	games: { default: "hero-poker" },
	identities: {
		default: "hero-identity",
		tabs: { register: "hero-crypto-identity", trading: "hero-trading" },
	},
	leaderboards: { default: "hero-leaderboards" },
	bounties: { default: "hero-marketplace" },
	storefront: {
		default: "hero-marketplace",
		tabs: { search: "hero-search", artifacts: "hero-artifacts" },
	},
	messaging: {
		default: "hero-messaging",
		tabs: {
			channels: "hero-public-channels",
			groups: "hero-groups",
			inbox: "hero-inbox",
		},
	},
	moderation: { default: "hero-security" },
	onramp: { default: "hero-payments" },
	profiles: { default: "hero-profiles" },
	stats: { default: "hero-stats", tabs: { pricing: "hero-pricing" } },
};

/**
 * Resolves the hero image name for a section and its currently open tab,
 * falling back to the section default. Returns `undefined` for sections without
 * a corresponding docs page/image (e.g. settings, feedback, terms).
 */
export function resolveSectionHero(
	section: string,
	tab: string | undefined
): string | undefined {
	const entry = sectionHeroes[section];
	if (!entry) return undefined;
	if (tab !== undefined && entry.tabs?.[tab] !== undefined) {
		return entry.tabs[tab];
	}
	return entry.default;
}
