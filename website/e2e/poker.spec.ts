import { test, expect, type Page, type Route } from "@playwright/test";

// The poker UI reads room state from the cross-origin backend
// (NEXT_PUBLIC_API_BASE_URL) over REST and streams live action over a WebSocket.
// These tests intercept the REST calls for deterministic table state and mock the
// room WebSocket (Playwright routeWebSocket) to drive the live action chatbox —
// exercising the real lobby → room → streamed-win flow with no backend.

const ROOM_ID = "room_e2e_ui";
const SEED_HEX =
	"101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f";

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

function room(): Record<string, unknown> {
	return {
		roomId: ROOM_ID,
		game: "texas-holdem",
		variant: "no-limit",
		name: "E2E Table",
		creator: "@creator",
		stakes: {
			smallBlind: "0.500000",
			bigBlind: "1.000000",
			asset: "USDC",
			network: "eip155:8453",
		},
		buyIn: { min: "20.000000", max: "100.000000" },
		escrow: { contract: "0xescrow", network: "eip155:8453" },
		seats: 2,
		players: [
			{ seat: 1, handle: "@alice", stack: "19.000000", status: "active" },
			{ seat: 2, handle: "@bob", stack: "20.000000", status: "active" },
		],
		observerCount: 0,
		speed: "normal",
		timeouts: { decision: 30, disconnectGrace: 30 },
		rake: { rate: "0.01", cap: "5.000000" },
		handNumber: 1,
		status: "playing",
		currentHand: {
			handId: "hand_ui_1",
			roomId: ROOM_ID,
			number: 1,
			status: "flop",
			dealerSeat: 1,
			smallBlindSeat: 1,
			bigBlindSeat: 2,
			currentSeat: 2,
			currentBet: "0",
			pot: "3.000000",
			players: [
				{ seat: 1, handle: "@alice", result: "active" },
				{ seat: 2, handle: "@bob", result: "active" },
			],
			communityCards: ["As", "Kh", "Td"],
			startedAt: "2026-06-14T00:00:00Z",
		},
		createdAt: "2026-06-14T00:00:00Z",
		updatedAt: "2026-06-14T00:00:00Z",
	};
}

type CreateCapture = {
	body: Record<string, unknown>;
	headers: Record<string, string>;
};

async function installRoomMocks(
	page: Page,
	onCreate?: (capture: CreateCapture) => void
): Promise<void> {
	// Room list (lobby). Anchored so it does not also catch /rooms/{id}.
	await page.route(/\/rooms(\?.*)?$/, async (route) => {
		if (route.request().method() === "POST") {
			const body = JSON.parse(route.request().postData() ?? "{}") as Record<
				string,
				unknown
			>;
			onCreate?.({ body, headers: route.request().headers() });
			await json(route, {
				...room(),
				...body,
				roomId: "room_created_e2e",
				createdAt: "2026-06-14T00:00:00Z",
				updatedAt: "2026-06-14T00:00:00Z",
			});
			return;
		}
		await json(route, { rooms: [room()] });
	});
	// Single room detail.
	await page.route(/\/rooms\/[^/]+(\?.*)?$/, (route) => json(route, room()));
}

async function enableE2EAuth(page: Page): Promise<void> {
	await page.addInitScript(() => {
		window.localStorage.setItem("tinyplace:e2e", "1");
	});
}

async function connectPlayer(page: Page): Promise<void> {
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

test.describe("poker", () => {
	test("lobby lists ranked rooms and links to room detail", async ({
		page,
	}) => {
		await installRoomMocks(page);
		await page.goto("/poker");

		await expect(
			page.getByRole("heading", { name: "Poker", level: 1 })
		).toBeVisible();
		await expect(page.getByText("Create room")).toBeVisible();
		const roomLink = page.getByRole("link", { name: /E2E Table/ });
		await expect(roomLink.getByText("Min entry")).toBeVisible();
		await expect(roomLink).toBeVisible();

		await roomLink.click();
		await expect(page).toHaveURL(new RegExp(`/poker/${ROOM_ID}`));
	});

	test("create room signs as the SDK actor without sending creator", async ({
		page,
	}) => {
		const captures: Array<CreateCapture> = [];
		await enableE2EAuth(page);
		await installRoomMocks(page, (capture) => {
			captures.push(capture);
		});
		await page.goto("/poker");
		await connectPlayer(page);

		await page.getByLabel("Name").fill("No Creator Room");
		await page.getByRole("button", { name: "Create", exact: true }).click();

		await expect
			.poll(() => captures.length, { timeout: 5_000 })
			.toBeGreaterThan(0);
		const capture = captures[0]!;
		expect(capture.body).not.toHaveProperty("creator");
		expect(capture.body).toMatchObject({
			game: "poker",
			name: "No Creator Room",
			variant: "holdem",
		});
		expect(capture.headers["x-agent-id"]).toBeTruthy();
		expect(capture.headers["x-agent-id"]).toBe(
			capture.headers["x-tinyplace-public-key"]
		);
	});

	test("room detail renders seats, board and pot from room state", async ({
		page,
	}) => {
		await installRoomMocks(page);
		await page.goto(`/poker/${ROOM_ID}`);

		// Both seats are shown with their handles.
		await expect(page.getByText("@alice")).toBeVisible();
		await expect(page.getByText("@bob")).toBeVisible();
		// The flop is shown as a compact text board.
		await expect(page.getByText("A♠ K♥ 10♦")).toBeVisible();
		// Pot is surfaced (3.000000 -> "3").
		await expect(page.getByText("Pot")).toBeVisible();
		// The live action chatbox is present.
		await expect(page.getByText("Live action")).toBeVisible();
	});

	test("chatbox streams live actions and the winner", async ({ page }) => {
		await installRoomMocks(page);
		// Mock the room websocket: on connect, narrate a hand to a win.
		await page.routeWebSocket(/\/rooms\/.*\/stream/, (ws) => {
			const send = (type: string, data: unknown): void =>
				ws.send(JSON.stringify({ type, data }));
			send("hand_start", { handNumber: 1, dealer: 1 });
			send("action", { seat: 2, action: "raise", amount: "2.000000" });
			send("community_cards", { street: "flop", cards: ["As", "Kh", "Td"] });
			send("hand_result", {
				winners: [{ seat: 1, agent: "@alice", payout: "19.800000" }],
				rake: "0.200000",
				txHash: "mock:e2e:game_payout",
			});
		});

		await page.goto(`/poker/${ROOM_ID}`);

		// The stream is live and the narrated lines appear, ending in the win.
		await expect(page.getByText("live", { exact: true })).toBeVisible();
		await expect(page.getByText("@bob raises 2")).toBeVisible();
		await expect(page.getByText("Flop: A♠ K♥ 10♦")).toBeVisible();
		await expect(page.getByText("@alice wins 19.8")).toBeVisible();
	});
});
