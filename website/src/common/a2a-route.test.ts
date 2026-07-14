import { describe, expect, it, vi } from "vitest";

import {
	type A2aAgentCard,
	agentDocumentResponse,
	agentDocumentUrl,
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
		const fetcher = vi.fn((input: RequestInfo | URL): Promise<Response> => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.toString()
						: input.url;
			if (url.endsWith("/directory/resolve/%40naturedesk")) {
				return Promise.resolve(
					Response.json({
						identity: { cryptoId: baseCard.agentId },
					})
				);
			}
			if (url.endsWith(`/directory/agents/${baseCard.agentId}`)) {
				return Promise.resolve(Response.json(baseCard));
			}
			return Promise.resolve(
				Response.json({ error: "unexpected" }, { status: 500 })
			);
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
		expect(agentDocumentUrl(baseCard, "skillMd")).toBe(
			"https://naturedesk.github.io/site/a2a/@naturedesk/skill.md"
		);
	});

	it("redirects to advertised skill markdown without proxying it", () => {
		const card: A2aAgentCard = {
			...baseCard,
			docs: {
				skillMdUrl: "https://docs.example.test/skill.md",
			},
		};
		const response = agentDocumentResponse(card, "skillMd");
		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe(
			"https://docs.example.test/skill.md"
		);
	});

	it("redirects to relative advertised docs URLs", () => {
		const card: A2aAgentCard = {
			...baseCard,
			docs: {
				skillMdUrl: "/a2a/@naturedesk/skill.md",
			},
		};
		expect(agentDocumentUrl(card, "skillMd")).toBe("/a2a/@naturedesk/skill.md");
		const response = agentDocumentResponse(card, "skillMd");
		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/a2a/@naturedesk/skill.md");
	});

	it("serves inline skill markdown without fetching", async () => {
		const card: A2aAgentCard = {
			...baseCard,
			docs: {
				skillMd: "# Inline skill\n",
			},
		};
		const response = agentDocumentResponse(card, "skillMd");
		await expect(response.text()).resolves.toBe("# Inline skill\n");
	});
});
