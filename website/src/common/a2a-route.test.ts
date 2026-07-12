import { describe, expect, it, vi } from "vitest";

import {
	type A2aAgentCard,
	agentDocResponse,
	agentDocUrl,
	resolveA2aAgentCard,
} from "./a2a-route";

const baseCard: A2aAgentCard = {
	agentId: "A8sVmcaC5apxoUx1kCA4pPa9RttQK1HXmfkziSFf5dVg",
	createdAt: "2026-07-11T00:00:00Z",
	cryptoId: "A8sVmcaC5apxoUx1kCA4pPa9RttQK1HXmfkziSFf5dVg",
	name: "NatureDesk",
	updatedAt: "2026-07-11T00:00:00Z",
	url: "https://naturedesk.github.io/site/a2a/@naturedesk/agent-card.json",
};

describe("A2A route helpers", () => {
	it("resolves @handles through the directory before fetching the agent card", async () => {
		const fetcher = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.endsWith("/directory/resolve/%40naturedesk")) {
				return Response.json({
					identity: { cryptoId: baseCard.agentId },
				});
			}
			if (url.endsWith(`/directory/agents/${baseCard.agentId}`)) {
				return Response.json(baseCard);
			}
			return Response.json({ error: "unexpected" }, { status: 500 });
		});

		await expect(
			resolveA2aAgentCard(
				"@naturedesk",
				fetcher as typeof fetch,
				"https://api.example.test"
			)
		).resolves.toMatchObject({ name: "NatureDesk" });
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it("derives docs from an external agent-card URL when no docs URL is advertised", () => {
		expect(agentDocUrl(baseCard, "skillMd")).toBe(
			"https://naturedesk.github.io/site/a2a/@naturedesk/skill.md"
		);
	});

	it("redirects to advertised skill markdown without proxying it", async () => {
		const card: A2aAgentCard = {
			...baseCard,
			docs: {
				skillMdUrl: "https://docs.example.test/skill.md",
			},
		};
		const fetcher = vi.fn();

		const response = await agentDocResponse(card, "skillMd", fetcher as typeof fetch);
		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe(
			"https://docs.example.test/skill.md"
		);
		expect(fetcher).not.toHaveBeenCalled();
	});

	it("redirects to relative advertised docs URLs", async () => {
		const card: A2aAgentCard = {
			...baseCard,
			docs: {
				skillMdUrl: "/a2a/@naturedesk/skill.md",
			},
		};
		const fetcher = vi.fn();

		expect(agentDocUrl(card, "skillMd")).toBe("/a2a/@naturedesk/skill.md");
		const response = await agentDocResponse(card, "skillMd", fetcher as typeof fetch);
		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/a2a/@naturedesk/skill.md");
		expect(fetcher).not.toHaveBeenCalled();
	});

	it("serves inline skill markdown without fetching", async () => {
		const card: A2aAgentCard = {
			...baseCard,
			docs: {
				skillMd: "# Inline skill\n",
			},
		};
		const fetcher = vi.fn();

		const response = await agentDocResponse(card, "skillMd", fetcher as typeof fetch);
		await expect(response.text()).resolves.toBe("# Inline skill\n");
		expect(fetcher).not.toHaveBeenCalled();
	});
});
