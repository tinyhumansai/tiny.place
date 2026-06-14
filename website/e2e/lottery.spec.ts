import { test, expect, type Page, type Route } from "@playwright/test";
import { LocalSigner } from "@tinyhumansai/tinyplace";

// The lottery page reads from a cross-origin backend (NEXT_PUBLIC_API_BASE_URL).
// These tests intercept those calls so the UI is exercised against fixed,
// deterministic data — and drive the *real* in-app flows: the x402 402-challenge
// buy (a connected player signs the authorization and retries), ticket transfer,
// and the settled-round winners list. Authentication is established through the
// localStorage-gated E2EAuthBridge (see src/components/E2EAuthBridge.tsx), which
// seeds a deterministic LocalSigner — the same primitive a real hot-session login
// uses — so no browser wallet extension is needed.

const LOTTERY_PROGRAM = "MfwLo55Nkv3SCQ2uFuoWXmAe7zJR6t3rMdm9K8Lr5Me";
const TICKET_PRICE_MICROS = "1000000"; // 1 USDC = 1 ticket

// A fixed 32-byte seed -> a deterministic player identity. The same seed runs in
// Node here (to precompute the agent id used in the winners mock) and in the
// browser bridge (to log the player in), so the two agree.
const SEED_HEX = "42".repeat(32);

const CORS = {
	"access-control-allow-origin": "*",
	"access-control-allow-headers": "*",
	"access-control-allow-methods": "*",
};

let PLAYER_ID: string;

test.beforeAll(async () => {
	const signer = await LocalSigner.fromSeed(
		Uint8Array.from(Buffer.from(SEED_HEX, "hex"))
	);
	PLAYER_ID = signer.publicKeyBase64;
});

function json(route: Route, body: unknown, status = 200): Promise<void> {
	if (route.request().method() === "OPTIONS") {
		return route.fulfill({ status: 204, headers: CORS });
	}
	return route.fulfill({
		status,
		headers: { ...CORS, "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

type LotteryState = {
	potMicros: string;
	ticketCount: number;
	participantCount: number;
	holdings: number;
};

type MockOptions = {
	settledWinnerId?: string;
};

/**
 * Installs deterministic lottery routes on `page`, each test getting its own
 * mutable `state` (no cross-test sharing, so the suite stays parallel-safe).
 */
async function installLotteryMocks(
	page: Page,
	options: MockOptions = {}
): Promise<LotteryState> {
	const state: LotteryState = {
		potMicros: "1000000",
		ticketCount: 1,
		participantCount: 1,
		holdings: 0,
	};

	const openRound = (): Record<string, unknown> => ({
		roundId: "rnd_e2e_open",
		status: "open",
		ticketPriceMicros: TICKET_PRICE_MICROS,
		asset: "USDC",
		network: "solana",
		escrow: {
			vault: "VaultE2E1111111111111111111111111111111111",
			contract: LOTTERY_PROGRAM,
		},
		feeBps: 500,
		decayBps: 5000,
		winnerFractionBps: 5000,
		maxWinners: 5,
		minParticipants: 2,
		potMicros: state.potMicros,
		ticketCount: state.ticketCount,
		participantCount: state.participantCount,
		seedCommit: "a".repeat(64),
		openedAt: "2026-06-14T00:00:00Z",
		cutoffAt: "2099-01-01T00:00:00Z",
		winners: [],
		settlementTxHashes: [],
		updatedAt: "2026-06-14T00:00:00Z",
	});

	const settledRound = (): Record<string, unknown> => ({
		roundId: "rnd_e2e_settled",
		status: "settled",
		ticketPriceMicros: TICKET_PRICE_MICROS,
		asset: "USDC",
		network: "solana",
		escrow: {
			vault: "VaultE2E2222222222222222222222222222222222",
			contract: LOTTERY_PROGRAM,
		},
		feeBps: 500,
		decayBps: 5000,
		winnerFractionBps: 5000,
		maxWinners: 5,
		minParticipants: 2,
		potMicros: "4000000",
		ticketCount: 4,
		participantCount: 2,
		seedCommit: "b".repeat(64),
		secret: "c".repeat(64),
		openedAt: "2026-06-13T00:00:00Z",
		cutoffAt: "2026-06-14T00:00:00Z",
		settledAt: "2026-06-14T00:00:01Z",
		rakeMicros: "200000",
		holdings: [
			{ owner: options.settledWinnerId ?? "winner-placeholder", tickets: 3 },
			{ owner: "@runner-up", tickets: 1 },
		],
		winners: [
			{
				rank: 1,
				owner: options.settledWinnerId ?? "winner-placeholder",
				tickets: 3,
				payoutMicros: "2533333",
			},
			{ rank: 2, owner: "@runner-up", tickets: 1, payoutMicros: "1266667" },
		],
		settlementTxHashes: ["mock:e2e:lottery:payout"],
		updatedAt: "2026-06-14T00:00:01Z",
	});

	// Order is irrelevant: the regexes are mutually exclusive (anchored on $).
	await page.route(/\/lottery\/rounds(\?.*)?$/, (route) =>
		json(route, { rounds: [settledRound()] })
	);

	await page.route(/\/lottery\/buy$/, async (route) => {
		if (route.request().method() === "OPTIONS") {
			await route.fulfill({ status: 204, headers: CORS });
			return;
		}
		const body = (route.request().postDataJSON() ?? {}) as {
			agentId?: string;
			amountMicros?: string;
			paymentAuthorization?: string;
		};
		// Unpaid first attempt -> 402 with the x402 challenge the hook signs.
		if (!body.paymentAuthorization) {
			await json(
				route,
				{
					error: "lottery ticket payment required",
					payment: {
						scheme: "exact",
						network: "solana",
						asset: "USDC",
						amount: body.amountMicros ?? TICKET_PRICE_MICROS,
						from: body.agentId ?? "",
						to: "FacilitatorVaultE2E11111111111111111111111",
						nonce: "nonce-e2e",
						expiresAt: "2099-01-01T00:00:00Z",
						metadata: { domain: "tiny.place" },
					},
				},
				402
			);
			return;
		}
		// Paid retry -> settle: mint tickets and grow the pot.
		const amount = BigInt(body.amountMicros ?? "0");
		const tickets = Number(amount / BigInt(TICKET_PRICE_MICROS));
		if (state.holdings === 0 && tickets > 0) {
			state.participantCount += 1;
		}
		state.potMicros = (BigInt(state.potMicros) + amount).toString();
		state.ticketCount += tickets;
		state.holdings += tickets;
		await json(route, {
			round: openRound(),
			tickets,
			holdings: state.holdings,
			txHash: "mock:e2e:lottery:buy",
		});
	});

	await page.route(/\/lottery\/transfer$/, async (route) => {
		if (route.request().method() === "OPTIONS") {
			await route.fulfill({ status: 204, headers: CORS });
			return;
		}
		const body = (route.request().postDataJSON() ?? {}) as {
			from?: string;
			to?: string;
			tickets?: number;
		};
		const moved = body.tickets ?? 0;
		state.holdings = Math.max(0, state.holdings - moved);
		await json(route, {
			roundId: "rnd_e2e_open",
			from: { owner: body.from ?? "", tickets: state.holdings },
			to: { owner: body.to ?? "", tickets: moved },
		});
	});

	// Current open round (GET /lottery, with or without auth). This path is also
	// the app's own page route, so let the document navigation through to Next and
	// only fulfill the cross-origin API fetch.
	await page.route(/\/lottery(\?.*)?$/, async (route) => {
		if (route.request().resourceType() === "document") {
			await route.fallback();
			return;
		}
		await json(route, { round: openRound(), holdings: state.holdings });
	});

	return state;
}

/** Activates the E2E auth bridge before any app script runs. */
async function enableE2EAuth(page: Page): Promise<void> {
	await page.addInitScript(() => {
		window.localStorage.setItem("tinyplace:e2e", "1");
	});
}

/** Logs the deterministic player in through the bridge; returns the agent id. */
async function connectPlayer(page: Page): Promise<string> {
	await page.waitForFunction(
		() =>
			Boolean(
				(window as unknown as { __tinyplaceE2E?: unknown }).__tinyplaceE2E
			),
		undefined,
		{ timeout: 15_000 }
	);
	const result = await page.evaluate(async (seedHex) => {
		const bridge = (
			window as unknown as {
				__tinyplaceE2E: {
					signIn: (seed: string) => Promise<{ agentId: string }>;
				};
			}
		).__tinyplaceE2E;
		return bridge.signIn(seedHex);
	}, SEED_HEX);
	return result.agentId;
}

test.describe("lottery page", () => {
	test("renders the open round and gates buying behind a wallet", async ({
		page,
	}) => {
		await installLotteryMocks(page);
		await page.goto("/lottery");

		await expect(
			page.getByRole("heading", { name: "Lottery", level: 1 })
		).toBeVisible();
		await expect(page.getByText("Pot", { exact: true })).toBeVisible();
		await expect(page.getByText("Participants")).toBeVisible();
		// 5% rake derives from feeBps 500.
		await expect(page.getByText("5.00%")).toBeVisible();
		// Without a connected wallet the buy form is disabled and prompts to connect.
		await expect(page.getByText("Connect your wallet first.")).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Buy tickets" })
		).toBeDisabled();
	});

	test("a connected player buys tickets through the x402 challenge flow", async ({
		page,
	}) => {
		await installLotteryMocks(page);
		await enableE2EAuth(page);
		await page.goto("/lottery");

		const agentId = await connectPlayer(page);
		expect(agentId).toBe(PLAYER_ID);

		// Pot starts at 1 USDC; the buy button enables once authenticated.
		const pot = page.locator("span.text-4xl");
		await expect(pot).toContainText("1");
		const buyButton = page.getByRole("button", { name: "Buy tickets" });
		await expect(buyButton).toBeEnabled();

		// Buy 3 tickets: the form posts unpaid (402), the hook signs the x402
		// authorization and retries paid, and the round settles the purchase.
		await page.locator("#lottery-buy-amount").fill("3");
		await buyButton.click();

		await expect(page.getByText("Bought 3 ticket(s).")).toBeVisible();
		// The pot grew by 3 USDC (1 -> 4) and the player now holds 3 tickets.
		await expect(pot).toContainText("4");
		const yourTickets = page
			.locator("div", { hasText: /^Your tickets/ })
			.locator("span.text-amber-500");
		await expect(yourTickets).toHaveText("3");
	});

	test("a player can transfer tickets to another agent", async ({ page }) => {
		await installLotteryMocks(page);
		await enableE2EAuth(page);
		await page.goto("/lottery");

		await connectPlayer(page);

		// Acquire tickets first so transfer is permitted.
		await page.locator("#lottery-buy-amount").fill("2");
		await page.getByRole("button", { name: "Buy tickets" }).click();
		await expect(page.getByText("Bought 2 ticket(s).")).toBeVisible();

		await page.locator("#lottery-transfer-to").fill("@bob");
		await page.locator("#lottery-transfer-count").fill("1");
		const transferButton = page.getByRole("button", { name: "Transfer" });
		await expect(transferButton).toBeEnabled();
		await transferButton.click();

		await expect(
			page.getByText("Transferred 1 ticket(s) to @bob.")
		).toBeVisible();
	});

	test("shows the connected player as a winner of the settled round", async ({
		page,
	}) => {
		await enableE2EAuth(page);
		// Seed the settled round so the connected player is the rank-1 winner.
		await installLotteryMocks(page, { settledWinnerId: PLAYER_ID });
		await page.goto("/lottery");

		const agentId = await connectPlayer(page);
		expect(agentId).toBe(PLAYER_ID);

		await expect(page.getByText("Past winners")).toBeVisible();
		// The player is the rank-1 winner with a ~2.53 USDC payout.
		await expect(page.getByText(PLAYER_ID)).toBeVisible();
		await expect(page.getByText("2.53 USDC")).toBeVisible();
		// The runner-up and the rake are also surfaced.
		await expect(page.getByText("@runner-up")).toBeVisible();
		await expect(page.getByText("Rake taken: 0.2 USDC")).toBeVisible();
	});
});
