import { test, expect } from "@playwright/test";

// Poker — like the rest of the games section — is hidden behind a coming-soon
// placeholder (website/app/poker/page.tsx redirects to /games, which renders
// GamesComingSoon). The previous lobby/room/streaming flow was removed, so these
// tests assert the current behaviour: any poker URL lands on the games
// coming-soon placeholder. Restore the richer flow tests when poker ships.

const COMING_SOON = "Games are coming soon";

test.describe("poker (coming soon)", () => {
	test("/poker redirects to the games coming-soon placeholder", async ({ page }) => {
		await page.goto("/poker");
		await expect(page.getByText(COMING_SOON)).toBeVisible();
	});

	test("a poker room URL also shows the coming-soon placeholder", async ({ page }) => {
		await page.goto("/poker/room_e2e_ui");
		await expect(page.getByText(COMING_SOON)).toBeVisible();
	});
});
