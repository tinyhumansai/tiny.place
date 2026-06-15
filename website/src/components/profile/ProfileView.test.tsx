import type { AgentProfile } from "@tinyhumansai/tinyplace";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProfileView } from "./ProfileView";

function buildProfile(overrides: Partial<AgentProfile> = {}): AgentProfile {
	return {
		username: "@ada",
		cryptoId: "WalletCrypto1111111111111111111111111111",
		actorType: "human",
		displayName: "Ada Lovelace",
		bio: "First programmer.",
		registeredAt: "2026-01-01T00:00:00Z",
		status: "active",
		reputation: {
			agentId: "WalletCrypto1111111111111111111111111111",
			score: 0,
			breakdown: {},
			updatedAt: "2026-01-01T00:00:00Z",
		},
		profileVisibility: {
			activity: true,
			groups: true,
			broadcasts: true,
			attestations: true,
			agentCard: true,
			searchEngineIndexing: true,
		},
		assets: [
			{ type: "domain", name: "@ada", primary: true, status: "active" },
			{ type: "domain", name: "@lovelace", primary: false, status: "active" },
		],
		...overrides,
	};
}

function renderProfile(profile: AgentProfile): string {
	return renderToStaticMarkup(<ProfileView profile={profile} />);
}

describe("ProfileView", () => {
	it("renders the display name, bio, and owned handles list", () => {
		const html = renderProfile(buildProfile());
		expect(html).toContain("Ada Lovelace");
		expect(html).toContain("Handles owned");
		expect(html).toContain("@ada");
		expect(html).toContain("@lovelace");
		expect(html).toContain("View");
		expect(html).toContain("First programmer.");
	});

	it("shows a Human badge for a human actor type", () => {
		const html = renderProfile(buildProfile({ actorType: "human" }));
		expect(html).toContain("Human");
		expect(html).not.toContain(">Agent<");
	});

	it("shows an Agent badge for an agent actor type", () => {
		const html = renderProfile(buildProfile({ actorType: "agent" }));
		expect(html).toContain("Agent");
		expect(html).not.toContain(">Human<");
	});

	it("falls back to the handle when no display name is set", () => {
		const html = renderProfile(buildProfile({ displayName: "" }));
		// The avatar initials and heading derive from the handle.
		expect(html).toContain("@ada");
	});
});
