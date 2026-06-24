import { expect, test } from "@playwright/test";

import { freshSeed } from "./support/identity-e2e";

// Real on-chain x402 bounty funding driven through the WEBSITE UI against the
// LOCAL DEVNET stack (same harness as x402-registration.spec.ts):
//
//   browser → next on PLAYWRIGHT_PORT → real-rpc backend :8083 → validator :8899
//
// Creating a bounty funds its reward into the escrow wallet in one x402 flow:
// the first POST returns the standard 402 challenge, the website signs an
// OFF-CHAIN x402 authorization (it never broadcasts a Solana tx itself), and the
// backend's facilitator broadcasts the SPL transfer into escrow server-side
// before the bounty is created `open`. This is the same parse + server-settle
// path as registration — this test guards that bounties get it too:
//
//  - use-bounties reads the standard `error.paymentRequired` (accepts[]) shape.
//  - the bounty X402Verifier verify+settles via SettlePayment, and the
//    rpc verifier no longer mistakes the off-chain `signature` for an on-chain
//    tx (which would skip custodial settlement).
//
// Gated behind E2E_X402; needs the devnet stack up. Run via
// scripts/e2e-x402-devnet.sh (it runs every e2e/x402-*.spec.ts).
test.describe("x402 bounty funding (web UI, local devnet)", () => {
	test.skip(
		!process.env.E2E_X402,
		"local devnet x402 stack only — set E2E_X402=1 with the :8083 backend + validator up",
	);
	// Funding waits for on-chain settlement on the local validator.
	test.describe.configure({ timeout: 90_000 });

	const uniqueTitle = (): string =>
		`E2E bounty ${Math.random().toString(36).slice(2, 8)}`;

	test("create & fund a bounty through the UI settles a real on-chain x402 payment", async ({
		page,
	}) => {
		const seed = freshSeed();
		const title = uniqueTitle();

		// Authenticate as a fresh wallet via the e2e bridge, on the bounties page.
		// (A bounty creator need not be a registered handle — just authenticated.)
		await page.addInitScript(() => {
			window.localStorage.setItem("tinyplace:e2e", "1");
		});
		await page.goto("/bounties");
		await page.waitForFunction(
			() =>
				Boolean(
					(window as unknown as { __tinyplaceE2E?: unknown }).__tinyplaceE2E,
				),
			undefined,
			{ timeout: 15_000 },
		);
		const reSignIn = async (): Promise<void> => {
			await page.evaluate(async (s) => {
				const bridge = (
					window as unknown as {
						__tinyplaceE2E?: { signIn: (seed: string) => Promise<unknown> };
					}
				).__tinyplaceE2E;
				if (bridge) {
					await bridge.signIn(s);
				}
			}, seed);
		};
		await reSignIn();

		// Open the "Post a bounty" tab and fill the form (reward defaults to 10
		// USDC, which the 402 challenge pins into escrow).
		await page
			.getByRole("button", { name: "Post a bounty", exact: true })
			.click();
		await page.getByPlaceholder("Design a logo for @acme").fill(title);
		await page
			.getByPlaceholder("What does the winning submission need to deliver?")
			.fill("Deliver the e2e artifact.");

		// Submit funds the reward. Re-establish the bridge session until the submit
		// button is enabled — the wallet adapter clears it on its no-wallet branch
		// (always true in e2e), racing the initial sign-in.
		const submit = page.getByRole("button", { name: /Create & fund/ });
		await expect(async () => {
			await reSignIn();
			await expect(submit).toBeEnabled({ timeout: 2_000 });
		}).toPass({ timeout: 30_000 });
		await submit.click();

		// The backend settles the reward into escrow server-side; on success the
		// view switches to the funded bounty's detail (title heading + open status).
		await expect(page.getByRole("heading", { name: title })).toBeVisible({
			timeout: 60_000,
		});
		await expect(page.getByText("open", { exact: true })).toBeVisible();
	});
});
