import { expect, test } from "@playwright/test";

import { freshSeed, openTab, signInSession } from "./support/identity-e2e";

// Real on-chain x402 identity registration driven entirely through the WEBSITE
// UI against the LOCAL DEVNET stack:
//
//   browser (this suite) → next dev/start on PLAYWRIGHT_PORT
//                        → real-rpc backend on :8083 (E2E_API_URL)
//                        → solana-test-validator (:8899) + local facilitator
//
// It is the end-to-end regression for two fixes that together make web
// registration work against a real verifier:
//
//  1. Standard x402 v2 challenge parsing. The backend now answers 402 with the
//     standard `{ x402Version, accepts: [{ scheme, network, asset, amount,
//     payTo, ... }] }` shape (no legacy top-level `payment`). The website reads
//     the SDK-normalized `error.paymentRequired` instead of the raw body, so the
//     wallet sees a well-formed challenge to authorize.
//
//  2. Server-side settlement. The website signs an OFF-CHAIN x402 authorization
//     (the standard exact-scheme flow — it never broadcasts a Solana tx itself);
//     the backend's facilitator broadcasts the SPL transfer to the treasury from
//     its own funded account and records the on-chain signature. A real transfer
//     lands on the validator before the identity is created.
//
// Driving the browser exercises the production code path (DomainRegistration →
// signX402ChallengePaymentMap → register), not a Node shortcut. The headless
// auth bridge supplies a hot-session signer so no wallet extension is needed.
//
// Gated behind E2E_X402 — it needs the local devnet stack up and never runs in
// CI. Bring the stack up and run it with:
//
//   scripts/e2e-x402-devnet.sh        (from the website package)
//
// or manually: real-rpc backend on :8083, `next` served with
// NEXT_PUBLIC_API_BASE_URL=http://localhost:8083, then
//   E2E_X402=1 PLAYWRIGHT_PORT=3100 pnpm exec playwright test \
//     e2e/x402-registration.spec.ts
test.describe("x402 registration (web UI, local devnet)", () => {
	test.skip(
		!process.env.E2E_X402,
		"local devnet x402 stack only — set E2E_X402=1 with the :8083 backend + validator up",
	);
	// Settlement waits for on-chain confirmation on the local validator.
	test.describe.configure({ timeout: 90_000 });

	const uniqueHandle = (): string =>
		`web${Math.random().toString(36).slice(2, 8)}`;

	test("register a handle through the UI settles a real on-chain x402 payment", async ({
		page,
	}) => {
		const seed = freshSeed();
		const handle = uniqueHandle();

		// Authenticate the browser as a fresh wallet via the e2e bridge, then open
		// the Register tab.
		await signInSession(page, seed);
		await openTab(page, "Register");

		// Re-establish the bridge session if the wallet adapter wipes it: with no
		// real wallet connected (always true in e2e), the Phantom provider's effect
		// calls clearSession on mount/settle, which races the initial sign-in. A
		// quick re-sign-in once the adapter has settled sticks.
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

		// Search for the (fresh, therefore available) handle. Availability is
		// checked live as the field changes; clicking "Check" selects the name as
		// soon as the availability query resolves to available, advancing to the
		// selected-name panel. Retry — riding out both the availability-query race
		// and the wallet-adapter session-clear — until the Authorize button is
		// present AND enabled (signer present).
		await page.getByPlaceholder("Search for a name...").fill(handle);
		const authorize = page.getByRole("button", {
			name: /Authorize .* & Register/,
		});
		await expect(async () => {
			await reSignIn();
			const check = page.getByRole("button", { name: "Check", exact: true });
			if (await check.isVisible()) {
				await check.click();
			}
			await expect(authorize).toBeEnabled({ timeout: 2_000 });
		}).toPass({ timeout: 45_000 });

		// Clicking Authorize issues the unpaid request, parses the standard 402
		// challenge, and opens the x402 confirm dialog.
		await authorize.click();

		// Confirm dialog: sign the x402 authorization. The backend then settles the
		// transfer server-side and the dialog only reports success after on-chain
		// settlement confirms.
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();
		await dialog.getByRole("button", { name: "Sign x402" }).click();

		await expect(dialog.getByText(/Payment confirmed/i)).toBeVisible({
			timeout: 60_000,
		});

		// Closing the dialog surfaces the registered confirmation.
		await dialog.getByRole("button", { name: "Done" }).click();
		await expect(page.getByText("Domain Registered")).toBeVisible({
			timeout: 15_000,
		});
	});
});
