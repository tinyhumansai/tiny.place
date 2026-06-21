import { test, expect, type Page, type Route } from "@playwright/test";

// Proves the GraphQL feed eliminates the per-author attestations N+1 in the
// browser: each home-feed render issues ONE batched POST /graphql (not one per
// author) and ZERO /reputation/{agentId}/attestations requests, with the
// verified badge rendered from the embedded author.verified flag. The feed is
// public, so it renders once anonymously on load and once more (personalized)
// after the wallet connects — two batched requests total, the N+1 property
// holding for each render.
//
// NEXT_PUBLIC_GRAPHQL_FEED is inlined at build time, so this only exercises the
// GraphQL path when the site was built with it on. It is gated on E2E_GRAPHQL so
// the default CI build (flag off) skips it rather than failing.
test.describe(() => {
	test.skip(
		!process.env["E2E_GRAPHQL"],
		"requires a build with NEXT_PUBLIC_GRAPHQL_FEED=1 (set E2E_GRAPHQL=1)"
	);

	const API_BASE =
		process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "https://staging-api.tiny.place";
	const SEED_HEX = "11".repeat(32);

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

	const HOME_FEED = {
		data: {
			homeFeed: {
				count: 2,
				items: [
					{
						score: 2,
						reason: "following",
						post: {
							postId: "p1",
							feedId: "wallet-a",
							body: "verified author post",
							commentCount: 0,
							likeCount: 1,
							createdAt: "2026-02-01T00:00:00Z",
							viewerHasLiked: false,
							author: {
								handle: "@alice",
								cryptoId: "wallet-a",
								displayName: "Alice",
								verified: true,
							},
						},
					},
					{
						score: 1,
						reason: "recommended",
						post: {
							postId: "p2",
							feedId: "wallet-b",
							body: "unverified author post",
							commentCount: 0,
							likeCount: 0,
							createdAt: "2026-02-01T00:00:00Z",
							viewerHasLiked: false,
							author: {
								handle: "@bob",
								cryptoId: "wallet-b",
								displayName: "Bob",
								verified: false,
							},
						},
					},
				],
			},
		},
	};

	async function enableE2EAuth(page: Page): Promise<void> {
		await page.addInitScript(() => {
			window.localStorage.setItem("tinyplace:e2e", "1");
		});
	}

	async function connect(page: Page): Promise<void> {
		await page.waitForFunction(
			() =>
				Boolean(
					(window as unknown as { __tinyplaceE2E?: unknown }).__tinyplaceE2E
				),
			undefined,
			{ timeout: 15_000 }
		);
		await page.evaluate(async (seedHex) => {
			const bridge = (
				window as unknown as {
					__tinyplaceE2E: {
						signIn: (seed: string) => Promise<{ agentId: string }>;
					};
				}
			).__tinyplaceE2E;
			await bridge.signIn(seedHex);
		}, SEED_HEX);
	}

	test("home feed renders from batched graphql requests with zero attestation fetches", async ({
		page,
	}) => {
		let graphqlCount = 0;
		let attestationCount = 0;

		await page.route(`${API_BASE}/graphql`, (route) => {
			if (route.request().method() === "POST") {
				graphqlCount += 1;
			}
			return json(route, HOME_FEED);
		});
		// The whole point: this must never be hit by the feed render.
		await page.route(`${API_BASE}/reputation/**/attestations*`, (route) => {
			attestationCount += 1;
			return json(route, { attestations: [] });
		});

		await enableE2EAuth(page);
		// Anonymous render: the public feed loads from one batched request.
		await page.goto("/feed");
		await expect(page.getByText("verified author post")).toBeVisible();
		expect(graphqlCount).toBe(1);

		// Connecting re-fetches the now-personalized feed — again one batched
		// request, never a per-author attestations fan-out.
		await connect(page);

		await expect(page.getByText("verified author post")).toBeVisible();
		await expect(page.getByText("unverified author post")).toBeVisible();
		// Alice's verified badge is present; Bob's is not.
		await expect(page.getByLabel("Verified on Twitter/X")).toHaveCount(1);

		expect(graphqlCount).toBe(2);
		expect(attestationCount).toBe(0);
	});
});
