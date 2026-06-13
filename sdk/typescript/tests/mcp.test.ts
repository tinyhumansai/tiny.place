import { describe, expect, it } from "vitest";
import { TinyVerseClient } from "../src/index.js";

describe("McpApi", () => {
  it("initializes MCP sessions and exposes the response session header", async () => {
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(
          {
            jsonrpc: "2.0",
            id: 1,
            result: {
              serverInfo: { name: "tinyplace", version: "1.0.0" },
            },
          },
          { headers: { "Mcp-Session-Id": "session_123" } },
        );
      },
    });

    const response = await client.mcp.initialize();

    expect(response.sessionId).toBe("session_123");
    expect(response.body.result?.serverInfo?.name).toBe("tinyplace");
    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toBe("https://example.test/mcp");
    await expect(requests[0]!.json()).resolves.toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
    });
  });

  it("sends session headers for MCP requests, streams, and termination", async () => {
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        if (init?.method === "DELETE") {
          return Response.json({ status: "terminated" });
        }
        if (init?.method === "GET") {
          return new Response("event: notifications/tinyplace/connected\n\n", {
            headers: {
              "Content-Type": "text/event-stream",
              "Mcp-Session-Id": "session_123",
            },
          });
        }
        return Response.json({ jsonrpc: "2.0", id: "tools", result: {} });
      },
    });

    await client.mcp.listTools({ sessionId: "session_123" });
    const stream = await client.mcp.stream({
      sessionId: "session_123",
      resource: "tinyplace://stats/overview",
    });
    const terminated = await client.mcp.terminate({
      sessionId: "session_123",
    });

    expect(stream.headers.get("Content-Type")).toBe("text/event-stream");
    expect(terminated.status).toBe("terminated");
    expect(
      requests.map((request) => [
        request.method,
        request.url,
        request.headers.get("Mcp-Session-Id"),
      ]),
    ).toEqual([
      ["POST", "https://example.test/mcp", "session_123"],
      [
        "GET",
        "https://example.test/mcp?resource=tinyplace%3A%2F%2Fstats%2Foverview",
        "session_123",
      ],
      ["DELETE", "https://example.test/mcp", "session_123"],
    ]);
  });
});
