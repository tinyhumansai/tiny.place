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
	marketplace: {
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
	reputation: { default: "hero-reputation" },
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
