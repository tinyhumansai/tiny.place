import { test, expect, type Page, type Route } from "@playwright/test";

// The web app reads its data from a cross-origin backend
// (NEXT_PUBLIC_API_BASE_URL, default https://staging-api.tiny.place). These
// tests intercept those calls so the reputation UI is exercised against fixed,
// deterministic data rather than live staging.

const CORS = {
	"access-control-allow-origin": "*",
	"access-control-allow-headers": "*",
	"access-control-allow-methods": "*",
};

function json(route: Route, body: unknown): Promise<void> {
	if (route.request().method() === "OPTIONS") {
		return route.fulfill({ status: 204, headers: CORS });
	}
	return route.fulfill({
		status: 200,
		headers: { ...CORS, "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

const LEADERBOARD = {
	leaderboard: "reputation",
	period: "all-time",
	entries: [
		{ rank: 1, username: "@alice", score: 980, delta: 12 },
		{ rank: 2, username: "@bob", score: 740, delta: -3 },
		{ rank: 3, cryptoId: "WALLET3333", score: 510 },
	],
	updatedAt: "2026-02-01T00:00:00Z",
};

const TRUST_GRAPH = {
	nodes: [
		{ agentId: "alice", score: 980, trust: 0.95 },
		{ agentId: "bob", score: 740, trust: 0.4 },
	],
	edges: [{ vouchId: "v1", from: "alice", to: "bob", weight: 0.6 }],
	updatedAt: "2026-02-01T00:00:00Z",
};

async function mockReputation(
	page: Page,
	overrides: { entries?: Array<unknown> } = {}
): Promise<void> {
	await page.route("**/leaderboards/reputation*", (route) =>
		json(route, {
			...LEADERBOARD,
			entries: overrides.entries ?? LEADERBOARD.entries,
		})
	);
	await page.route("**/reputation/trust/graph*", (route) =>
		json(route, TRUST_GRAPH)
	);
}

test.describe("reputation explore page", () => {
	test("renders the leaderboard and links rows to profiles", async ({
		page,
	}) => {
		await mockReputation(page);
		await page.goto("/reputation");

		await expect(page.getByText("Reputation Leaderboard")).toBeVisible();
		await expect(page.getByText("@alice")).toBeVisible();
		await expect(page.getByText("@bob")).toBeVisible();
		// Username rows link to the handle detail route; wallet-only rows to /u/.
		await expect(page.locator('a[href="/handles/alice"]')).toBeVisible();
		await expect(page.locator('a[href="/u/WALLET3333"]')).toBeVisible();
	});

	test("switches to the referral graph tab", async ({ page }) => {
		await mockReputation(page);
		await page.goto("/reputation");

		await page.getByRole("button", { name: "Referral graph" }).click();

		await expect(page.getByText("High trust")).toBeVisible();
		await expect(page.getByText(/click to open profile/)).toBeVisible();
		// The leaderboard is no longer mounted.
		await expect(page.getByText("Reputation Leaderboard")).toBeHidden();
	});

	test("shows an empty state when there are no entries", async ({ page }) => {
		await mockReputation(page, { entries: [] });
		await page.goto("/reputation");

		await expect(
			page.getByText("No reputation data available yet.")
		).toBeVisible();
	});
});
