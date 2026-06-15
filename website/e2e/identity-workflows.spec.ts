import { test, expect, type Page } from "@playwright/test";

import {
	freshSeed,
	openTab,
	registerHandle,
	seedListing,
	signInSession,
} from "./support/identity-e2e";

// Live identity button/workflow coverage against the REAL stack. The headless
// auth bridge approves a hot-session signer (session mode), so x402 payment
// flows actually settle. Requires the docker stack on :3003/:8083 with a
// provisioned facilitator — gated behind E2E_LIVE so it never runs in CI.
//
//   E2E_LIVE=1 PLAYWRIGHT_PORT=3003 pnpm --filter @tinyplace/website \
//     exec playwright test e2e/identity-workflows.spec.ts
test.describe("identity workflows (live)", () => {
	test.skip(
		!process.env.E2E_LIVE,
		"live stack only — set E2E_LIVE=1 with the docker stack up"
	);
	test.describe.configure({ timeout: 60_000 });

	const uniq = (): string => Math.random().toString(36).slice(2, 8);

	// `handle` is passed without the leading @; the cards' test ids include it.
	function ownedCard(page: Page, handle: string) {
		return page.getByTestId(`identity-@${handle}`);
	}
	function listingCard(page: Page, handle: string) {
		return page.getByTestId(`listing-${handle}`);
	}
	function dialog(page: Page) {
		return page.getByRole("dialog");
	}

	test("signed-in owner sees their registered handle", async ({ page }) => {
		const seed = freshSeed();
		const handle = `own${uniq()}`;
		await registerHandle(seed, handle, true);
		await signInSession(page, seed);
		await openTab(page, "Trading");
		// Gate on the signed-in wallet's identities being loaded — listing-card
		// Buy/Offer actions depend on canActAsBuyer, and the owner cards depend on
		// the same reverse lookup.
		await expect(page.getByText("Your Identities")).toBeVisible({
			timeout: 25_000,
		});
		await expect(page.getByText("Your Identities")).toBeVisible({
			timeout: 20_000,
		});
		await expect(page.getByText(`@${handle}`).first()).toBeVisible();
	});

	test("renew settles via the x402 confirm dialog", async ({ page }) => {
		const seed = freshSeed();
		const handle = `rnw${uniq()}`;
		await registerHandle(seed, handle, true);
		await signInSession(page, seed);
		await openTab(page, "Trading");
		// Gate on the signed-in wallet's identities being loaded — listing-card
		// Buy/Offer actions depend on canActAsBuyer, and the owner cards depend on
		// the same reverse lookup.
		await expect(page.getByText("Your Identities")).toBeVisible({
			timeout: 25_000,
		});

		await ownedCard(page, handle)
			.getByRole("button", { name: "Renew" })
			.click();
		await expect(dialog(page)).toBeVisible();
		await dialog(page).getByRole("button", { name: "Renew" }).click();
		await expect(dialog(page).getByText(/Payment confirmed/i)).toBeVisible({
			timeout: 45_000,
		});
	});

	test("list a handle for sale", async ({ page }) => {
		const seed = freshSeed();
		await registerHandle(seed, `home${uniq()}`, true);
		const handle = `sell${uniq()}`;
		await registerHandle(seed, handle, false);
		await signInSession(page, seed);
		await openTab(page, "Trading");
		// Gate on the signed-in wallet's identities being loaded — listing-card
		// Buy/Offer actions depend on canActAsBuyer, and the owner cards depend on
		// the same reverse lookup.
		await expect(page.getByText("Your Identities")).toBeVisible({
			timeout: 25_000,
		});

		const card = ownedCard(page, handle);
		await card.getByRole("button", { name: "List for sale" }).click();
		const priceInput = card.getByPlaceholder(/Price|25\.00/i).first();
		await priceInput.fill("120000");
		await card.getByRole("button", { name: `List @${handle}` }).click();
		// createListing succeeds → the inline form panel closes (price input gone).
		// (The "Cancel listing" badge depends on a cached listings refetch, so we
		// assert the cache-independent success signal instead.)
		await expect(priceInput).toBeHidden({ timeout: 20_000 });
	});

	test("buy a fixed-price listing via the confirm dialog", async ({ page }) => {
		const { handle } = await seedListing("fixed");
		const buyerSeed = freshSeed();
		await registerHandle(buyerSeed, `buyer${uniq()}`, true);
		await signInSession(page, buyerSeed);
		await openTab(page, "Trading");
		// Gate on the signed-in wallet's identities being loaded — listing-card
		// Buy/Offer actions depend on canActAsBuyer, and the owner cards depend on
		// the same reverse lookup.
		await expect(page.getByText("Your Identities")).toBeVisible({
			timeout: 25_000,
		});

		await listingCard(page, handle).getByRole("button", { name: "Buy" }).click();
		await expect(dialog(page)).toBeVisible();
		await dialog(page).getByRole("button", { name: "Buy" }).click();
		await expect(dialog(page).getByText(/Payment confirmed/i)).toBeVisible({
			timeout: 45_000,
		});
	});

	test("place an auction bid via the confirm dialog", async ({ page }) => {
		const { handle } = await seedListing("auction");
		const bidderSeed = freshSeed();
		await registerHandle(bidderSeed, `bid${uniq()}`, true);
		await signInSession(page, bidderSeed);
		await openTab(page, "Trading");
		// Gate on the signed-in wallet's identities being loaded — listing-card
		// Buy/Offer actions depend on canActAsBuyer, and the owner cards depend on
		// the same reverse lookup.
		await expect(page.getByText("Your Identities")).toBeVisible({
			timeout: 25_000,
		});

		const card = listingCard(page, handle);
		await card.getByRole("button", { name: "Bid" }).click();
		await card.getByPlaceholder(/At least/i).fill("100000");
		await card.getByRole("button", { name: "Place bid" }).click();
		await expect(dialog(page)).toBeVisible();
		await dialog(page).getByRole("button", { name: "Place bid" }).click();
		await expect(dialog(page).getByText(/Payment confirmed/i)).toBeVisible({
			timeout: 45_000,
		});
	});

	test("make an offer via the confirm dialog", async ({ page }) => {
		const { handle } = await seedListing("fixed");
		const buyerSeed = freshSeed();
		await registerHandle(buyerSeed, `offr${uniq()}`, true);
		await signInSession(page, buyerSeed);
		await openTab(page, "Trading");
		// Gate on the signed-in wallet's identities being loaded — listing-card
		// Buy/Offer actions depend on canActAsBuyer, and the owner cards depend on
		// the same reverse lookup.
		await expect(page.getByText("Your Identities")).toBeVisible({
			timeout: 25_000,
		});

		const card = listingCard(page, handle);
		await card.getByRole("button", { name: "Offer" }).click();
		await card.getByPlaceholder(/Offer amount/i).fill("90000");
		await card.getByRole("button", { name: /^Offer on/ }).click();
		await expect(dialog(page)).toBeVisible();
		await dialog(page).getByRole("button", { name: "Submit offer" }).click();
		await expect(dialog(page).getByText(/Payment confirmed/i)).toBeVisible({
			timeout: 45_000,
		});
	});
});
