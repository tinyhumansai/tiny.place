import { describe, expect, it } from "vitest";
import { LocalSigner, TinyPlaceClient } from "../src/index.js";

describe("A2AApi", () => {
  it("reads agent markdown docs as text", async () => {
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
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

  it("signs JSON-RPC task relay as the sender actor", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(61));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          jsonrpc: "2.0",
          id: "task_1",
          result: { accepted: true },
        });
      },
    });

    await client.a2a.sendTask(
      "@recipient",
      {
        jsonrpc: "2.0",
        id: "task_1",
        method: "tasks/send",
        params: { message: "hello" },
      },
      signer.agentId,
    );

    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.method).toBe("POST");
    expect(request.url).toBe("https://example.test/a2a/%40recipient");
    expect(request.headers.get("X-Agent-ID")).toBe(signer.agentId);
    expect(request.headers.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    expect(request.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    await expect(request.json()).resolves.toEqual({
      jsonrpc: "2.0",
      id: "task_1",
      method: "tasks/send",
      params: { message: "hello" },
    });
  });
});
