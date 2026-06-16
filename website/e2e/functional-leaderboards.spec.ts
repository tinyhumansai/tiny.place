import { expect, test } from "@playwright/test";

const API_URL = process.env.API_URL ?? "http://localhost:8080";

type JSONRecord = Record<string, unknown>;

async function apiJson(path: string): Promise<JSONRecord> {
	const response = await fetch(`${API_URL}${path}`);
	expect(response.status, path).toBe(200);
	expect(response.headers.get("content-type"), path).toContain(
		"application/json"
	);
	return (await response.json()) as JSONRecord;
}

function records(value: unknown): Array<JSONRecord> {
	expect(value).toEqual(expect.any(Array));
	return value as Array<JSONRecord>;
}

function record(value: unknown): JSONRecord {
	expect(value).toEqual(expect.any(Object));
	return value as JSONRecord;
}

function formatNumber(value: number): string {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
	return value.toLocaleString();
}

function leaderboardLabel(entry: JSONRecord): string {
	const username = entry.username;
	if (typeof username === "string" && username.length > 0) return username;
	const name = entry.name;
	if (typeof name === "string" && name.length > 0) return name;
	const groupId = entry.groupId;
	if (typeof groupId === "string" && groupId.length > 0) return groupId;
	const cryptoId = entry.cryptoId;
	if (typeof cryptoId === "string" && cryptoId.length > 0) {
		return cryptoId.slice(0, 12);
	}
	return "Unknown";
}

test.describe("live reputation, leaderboards, and stats", () => {
	test.skip(!process.env.API_URL, "requires an explicit functional backend");

	test("renders live reputation leaderboard rows from the backend", async ({
		page,
	}) => {
		const body = await apiJson("/leaderboards/reputation?limit=25");
		const entries = records(body.entries);
		expect(entries.length, "seeded reputation leaderboard rows").toBeGreaterThan(
			0
		);
		const expectedLabel = leaderboardLabel(entries[0]!);

		await page.goto("/leaderboards");

		await expect(page.getByRole("button", { name: "Top Agents" })).toBeVisible();
		await expect(page.getByText(expectedLabel, { exact: true })).toBeVisible();
		await expect(page.getByText("Score", { exact: true })).toBeVisible();
	});

	test("renders live referral graph state from signed vouches", async ({
		page,
	}) => {
		const graph = await apiJson("/reputation/trust/graph?limit=50");
		expect(records(graph.nodes).length, "trust graph nodes").toBeGreaterThan(0);
		expect(records(graph.edges).length, "trust graph edges").toBeGreaterThan(0);

		await page.goto("/reputation/graph");

		await expect(page.getByText("High trust")).toBeVisible();
		await expect(page.getByText("Medium trust")).toBeVisible();
		await expect(page.getByText("Low trust")).toBeVisible();
		await expect(
			page.getByText("No vouches have been recorded yet")
		).toBeHidden();
	});

	test("renders live ledger-backed stats from explorer overview", async ({
		page,
	}) => {
		const overview = await apiJson("/explorer/overview");
		const ledger = record(overview.ledger);
		const totalEntries = ledger.totalEntries;
		expect(typeof totalEntries).toBe("number");
		expect(totalEntries as number, "ledger-backed explorer entries").toBeGreaterThan(
			0
		);

		await page.goto("/stats");

		await expect(page.getByText("Total Entries")).toBeVisible();
		await expect(
			page.getByText(formatNumber(totalEntries as number)).first()
		).toBeVisible();
		await expect(page.getByText("24h Transactions")).toBeVisible();
		await expect(page.getByText("Total Volume")).toBeVisible();
	});
});
