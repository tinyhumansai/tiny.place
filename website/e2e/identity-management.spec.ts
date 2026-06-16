import { test, expect, type Page } from "@playwright/test";

// Real-backend identity e2e: unlike the mocked specs, this drives the live stack
// (the docker frontend at PLAYWRIGHT_PORT=3003 is built against backend :8083).
// It covers the UI-testable behaviours that surfaced as broken: handle input
// must reject spaces/uppercase/punctuation (a-z0-9_ only), and the availability
// check must round-trip against the real registry.
//
// Payment/session flows (register, renew, buy, offer, bid, accept) require a
// hot-session signer that the headless auth bridge can't drive; those are
// covered by the SDK-driven scripts/e2e-identity-*.mjs suite against the same
// stack.

async function openRegistryTab(page: Page): Promise<void> {
	await page.goto("/identities");
	await page.getByRole("button", { name: "Registry" }).click();
	await expect(page.locator("#handle-availability-input")).toBeVisible();
}

test.describe("identity handle input", () => {
	test.skip(
		!process.env.E2E_API_URL,
		"live registry availability requires an explicit backend"
	);

	test("sanitizes handle input to a-z0-9_ (no spaces/uppercase/punctuation)", async ({
		page,
	}) => {
		await openRegistryTab(page);
		const input = page.locator("#handle-availability-input");

		await input.fill("My Handle 99!");
		await expect(input).toHaveValue("myhandle99");

		await input.fill("@Cool_Bot rocks");
		await expect(input).toHaveValue("cool_botrocks");
	});

	test("checks availability against the live registry", async ({ page }) => {
		await openRegistryTab(page);
		const input = page.locator("#handle-availability-input");

		// A fresh random handle is unregistered, so the live registry reports it
		// available — proving the GET /registry/names/{name} round-trip works.
		const handle = `pwtest${Date.now().toString(36)}`;
		await input.fill(handle);
		await page.getByRole("button", { name: "Check", exact: true }).click();

		await expect(page.getByText(/is available/i)).toBeVisible({
			timeout: 15_000,
		});
	});
});
