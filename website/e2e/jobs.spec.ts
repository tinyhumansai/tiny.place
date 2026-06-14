import { test, expect, type Page, type Route } from "@playwright/test";

// The jobs marketplace renders against the cross-origin backend
// (NEXT_PUBLIC_API_BASE_URL). These tests intercept those calls with fixed data
// so the Jobs tab is exercised deterministically — including the AI judge
// panel's verdict, whose LLM responses are entirely mocked at the API boundary
// (no live GMI). Authentication for the verdict view uses the localStorage-gated
// E2EAuthBridge (a deterministic LocalSigner), so no wallet extension is needed.

const SEED_HEX = "11".repeat(32);

const CORS = {
	"access-control-allow-origin": "*",
	"access-control-allow-headers": "*",
	"access-control-allow-methods": "*",
};

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

const openJob = {
	jobId: "job_open",
	client: "@client",
	title: "Build a widget",
	description: "Need a Solana widget built well",
	budget: { amount: "10", asset: "SOL", chain: "solana" },
	status: "open",
	proposalCount: 2,
	createdAt: "2026-06-14T00:00:00Z",
	updatedAt: "2026-06-14T00:00:00Z",
};

const disputedJob = {
	jobId: "job_disputed",
	client: "@client",
	selectedCandidate: "@provider",
	contractEscrowId: "esc_1",
	title: "Logo design",
	description: "Design a brand logo",
	budget: { amount: "5", asset: "SOL", chain: "solana" },
	status: "disputed",
	proposalCount: 1,
	dispute: {
		reason: "client won't accept good work",
		openedBy: "@provider",
		openedAt: "2026-06-14T01:00:00Z",
		status: "resolved",
		outcome: "award_provider",
		splitBps: 10000,
		judgeModel: "anthropic/claude-opus-4-8",
		presided: true,
		reasoning: "The delivered logo meets the agreed brief.",
		jury: [
			{ model: "openai/gpt-5.5", outcome: "award_provider", splitBps: 10000 },
			{
				model: "deepseek-ai/deepseek-v4-pro",
				outcome: "award_provider",
				splitBps: 10000,
			},
			{ model: "google/gemini-3-pro", outcome: "award_provider", splitBps: 10000 },
		],
		resolvedAt: "2026-06-14T02:00:00Z",
	},
	createdAt: "2026-06-14T00:00:00Z",
	updatedAt: "2026-06-14T02:00:00Z",
};

async function installJobsMocks(page: Page): Promise<void> {
	// Job detail (must be registered before the list route so the more specific
	// pattern wins).
	await page.route(/\/jobs\/job_disputed(\?.*)?$/, (route) =>
		json(route, disputedJob)
	);
	await page.route(/\/jobs\/job_open(\?.*)?$/, (route) => json(route, openJob));
	// Job listing.
	await page.route(/\/jobs(\?.*)?$/, (route) =>
		json(route, { jobs: [openJob, disputedJob] })
	);
}

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

test.describe("jobs marketplace", () => {
	test("browse lists posted jobs", async ({ page }) => {
		await installJobsMocks(page);
		await page.goto("/marketplace");

		await page.getByRole("button", { name: "Jobs", exact: true }).click();
		await page.getByRole("button", { name: "Browse", exact: true }).click();

		await expect(page.getByText("Build a widget")).toBeVisible();
		await expect(page.getByText("Logo design")).toBeVisible();
		await expect(page.getByText("10 SOL")).toBeVisible();
	});

	test("shows the AI judge panel verdict on a resolved dispute", async ({
		page,
	}) => {
		await installJobsMocks(page);
		await enableE2EAuth(page);
		await page.goto("/marketplace");
		await connect(page);

		await page.getByRole("button", { name: "Jobs", exact: true }).click();
		await page.getByRole("button", { name: /Logo design/ }).click();

		// The presiding judge's verdict and the three jurors are rendered.
		await expect(page.getByText(/Judge verdict: award_provider/)).toBeVisible();
		await expect(page.getByText("anthropic/claude-opus-4-8")).toBeVisible();
		await expect(page.getByText(/openai\/gpt-5.5/)).toBeVisible();
		await expect(page.getByText(/deepseek-ai\/deepseek-v4-pro/)).toBeVisible();
		await expect(page.getByText(/google\/gemini-3-pro/)).toBeVisible();
	});
});
