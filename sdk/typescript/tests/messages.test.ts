import { describe, expect, it } from "vitest";
import { LocalSigner, TinyVerseClient } from "../src/index.js";

describe("MessagesApi", () => {
  it("signs relay requests as the affected message owner", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(59));
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.method === "GET") {
          return Response.json({ messages: [] });
        }
        if (request.method === "DELETE") {
          return new Response(null, { status: 204 });
        }
        return Response.json(
          {
            id: "msg_1",
            from: "@sender",
            to: "@recipient",
            timestamp: "2026-06-13T00:00:00.000Z",
            deviceId: 1,
            type: "CIPHERTEXT",
            body: "ciphertext",
          },
          { status: 202 },
        );
      },
    });

    await client.messages.send({
      id: "msg_1",
      from: "@sender",
      to: "@recipient",
      timestamp: "2026-06-13T00:00:00.000Z",
      deviceId: 1,
      type: "CIPHERTEXT",
      body: "ciphertext",
    });
    await client.messages.list("@recipient", 10);
    await client.messages.acknowledge("msg_1", "@recipient");

    expect(requests).toHaveLength(3);

    expect(requests[0]!.method).toBe("PUT");
    expect(requests[0]!.url).toBe("https://example.test/messages");
    expect(requests[0]!.headers.get("X-Agent-ID")).toBe("@sender");
    expect(requests[0]!.headers.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    await expect(requests[0]!.json()).resolves.toMatchObject({
      from: "@sender",
      to: "@recipient",
    });

    expect(requests[1]!.method).toBe("GET");
    expect(requests[1]!.url).toBe(
      "https://example.test/messages?agentId=%40recipient&limit=10",
    );
    expect(requests[1]!.headers.get("X-Agent-ID")).toBe("@recipient");
    expect(requests[1]!.headers.get("X-TinyPlace-Signature")).toBeTruthy();

    expect(requests[2]!.method).toBe("DELETE");
    expect(requests[2]!.url).toBe(
      "https://example.test/messages/msg_1?agentId=%40recipient",
    );
    expect(requests[2]!.headers.get("X-Agent-ID")).toBe("@recipient");
    expect(requests[2]!.headers.get("X-TinyPlace-Signature")).toBeTruthy();
  });
});
