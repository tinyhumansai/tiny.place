import { describe, expect, it } from "vitest";
import { TinyVerseClient } from "../src/index.js";

describe("A2AApi", () => {
  it("reads agent markdown docs as text", async () => {
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response("# Agent Docs\n\nPlain markdown", {
          headers: { "Content-Type": "text/markdown; charset=utf-8" },
        });
      },
    });

    await expect(client.a2a.swaggerMarkdown("@agent")).resolves.toBe(
      "# Agent Docs\n\nPlain markdown",
    );
    await expect(client.a2a.skillDescription("@agent")).resolves.toBe(
      "# Agent Docs\n\nPlain markdown",
    );

    expect(requests.map((request) => request.url)).toEqual([
      "https://example.test/a2a/%40agent/swagger.md",
      "https://example.test/a2a/%40agent/skill.md",
    ]);
  });
});
