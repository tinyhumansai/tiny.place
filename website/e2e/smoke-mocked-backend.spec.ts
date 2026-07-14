import { expect, test, type Route } from "@playwright/test";

// Hermetic smoke test: the web app must boot and render its shell without any
// live backend. Unlike the other e2e specs (gated behind E2E_LIVE / E2E_X402 /
// API_URL against a real stack), this one ALWAYS runs in CI — it is the guard
// that the build + app never depend on staging. Every backend call is
// intercepted by Playwright before it can reach the network, so no real backend
// is ever contacted; the assertions cover only static, data-independent shell
// content that must render regardless.
//
// The app resolves its API base from NEXT_PUBLIC_API_BASE_URL (an unreachable
// sentinel in CI, staging by default locally). We intercept that origin AND
// staging explicitly, so a real backend is never contacted in any environment.
const API_BASE =
	process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "https://staging-api.tiny.place";

const BACKEND_GLOBS = [
	`${API_BASE}/**`,
	"**/staging-api.tiny.place/**",
	"**/127.0.0.1:9999/**",
];

const CORS = {
	"access-control-allow-origin": "*",
	"access-control-allow-headers": "*",
	"access-control-allow-methods": "*",
};

/**
 * Simulate a backend that is simply not there: fulfil CORS preflights, and
 * answer everything else with an empty, well-formed body. TanStack Query hooks
 * degrade to empty/error states; the static shell renders regardless. We never
 * abort (that races page teardown and flakes) — an explicit empty response is
 * deterministic.
 */
function emptyBackend(route: Route): Promise<void> {
	const request = route.request();
	if (request.method() === "OPTIONS") {
		return route.fulfill({ status: 204, headers: CORS });
	}
	// GraphQL clients expect a { data } envelope; REST callers tolerate {}.
	const body = request.url().includes("/graphql") ? { data: {} } : {};
	return route.fulfill({
		status: 200,
		headers: { ...CORS, "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

test.describe("mocked-backend smoke", () => {
	test.beforeEach(async ({ page }) => {
		// Intercepting these globs guarantees no request reaches a real backend:
		// Playwright fulfils them before the network layer runs.
		for (const glob of BACKEND_GLOBS) {
			await page.route(glob, emptyBackend);
		}
	});

	test("home shell renders with no live backend", async ({ page }) => {
		await page.goto("/");

		// Static hero copy: present regardless of any backend data. Its presence
		// proves the layout + i18n + client bootstrap all work with the backend
		// fully mocked out.
		await expect(
			page.getByText("Enter as a Human", { exact: false })
		).toBeVisible();
	});

	test("static content route renders offline", async ({ page }) => {
		// /terms is server-rendered static section content — a route with no
		// backend dependency that must always serve.
		const response = await page.goto("/terms");
		expect(response?.status()).toBeLessThan(400);
		await expect(page.locator("body")).toBeVisible();
	});
});
