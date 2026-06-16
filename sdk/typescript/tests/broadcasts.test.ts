import { describe, expect, it } from "vitest";
import { LocalSigner, TinyPlaceClient } from "../src/index.js";

describe("BroadcastsApi", () => {
  it("normalizes null broadcast lists from staging-compatible responses", async () => {
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async () => Response.json({ broadcasts: null }),
    });

    await expect(client.broadcasts.list({ limit: 3 })).resolves.toEqual({
      broadcasts: [],
    });
  });

  it("signs broadcast owner, subscriber, and publisher requests as handle actors", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(25));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.endsWith("/subscribe")) {
          return Response.json({
            broadcastId: "bcast_123",
            agentId: "@subscriber",
            subscribedAt: "2026-06-13T00:00:00Z",
            status: "active",
          });
        }
        if (request.url.includes("/messages")) {
          return Response.json({
            messageId: "bmsg_123",
            broadcastId: "bcast_123",
            publisher: "@publisher",
            timestamp: "2026-06-13T00:00:00Z",
            contentType: "text/plain",
            body: "Hello subscribers",
            sequence: 1,
          });
        }
        return Response.json({
          broadcastId: "bcast_123",
          name: "Market Pulse",
          owner: "@owner",
          publishers: ["@owner"],
          subscriberCount: 0,
          visibility: "public",
          encryption: "none",
          createdAt: "2026-06-13T00:00:00Z",
          updatedAt: "2026-06-13T00:00:00Z",
        });
      },
    });

    await client.broadcasts.create({
      name: "Market Pulse",
      owner: "@owner",
      visibility: "public",
      encryption: "none",
    });
    await client.broadcasts.subscribe("bcast_123", {
      agentId: "@subscriber",
      paymentAuthorization: "signed-payment",
    });
    await client.broadcasts.postMessage("bcast_123", {
      publisher: "@publisher",
      body: "Hello subscribers",
      contentType: "text/plain",
    });
    await client.broadcasts.listMessages("bcast_123", {
      agentId: "@subscriber",
      limit: 5,
      paymentAuthorization: "read-payment",
    });

    expect(requests).toHaveLength(4);

    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toBe("https://example.test/broadcasts");
    expect(requests[0]!.headers.get("X-Agent-ID")).toBe("@owner");
    expect(requests[0]!.headers.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    expect(requests[0]!.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    await expect(requests[0]!.json()).resolves.toMatchObject({
      name: "Market Pulse",
      owner: "@owner",
    });

    expect(requests[1]!.method).toBe("POST");
    expect(requests[1]!.url).toBe(
      "https://example.test/broadcasts/bcast_123/subscribe",
    );
    expect(requests[1]!.headers.get("X-Agent-ID")).toBe("@subscriber");
    expect(requests[1]!.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    await expect(requests[1]!.json()).resolves.toEqual({
      agentId: "@subscriber",
      paymentAuthorization: "signed-payment",
    });

    expect(requests[2]!.method).toBe("POST");
    expect(requests[2]!.url).toBe(
      "https://example.test/broadcasts/bcast_123/messages",
    );
    expect(requests[2]!.headers.get("X-Agent-ID")).toBe("@publisher");
    expect(requests[2]!.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    await expect(requests[2]!.json()).resolves.toMatchObject({
      publisher: "@publisher",
      body: "Hello subscribers",
    });

    expect(requests[3]!.method).toBe("GET");
    expect(requests[3]!.url).toBe(
      "https://example.test/broadcasts/bcast_123/messages?limit=5",
    );
    expect(requests[3]!.headers.get("X-Agent-ID")).toBe("@subscriber");
    expect(requests[3]!.headers.get("X-Payment-Authorization")).toBe(
      "read-payment",
    );
    expect(requests[3]!.headers.get("X-TinyPlace-Signature")).toBeTruthy();
  });

  it("signs add/remove publisher requests as the actor when one is given", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(7));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({});
      },
    });

    await client.broadcasts.addPublisher("bcast_123", "@new-pub", "@owner");
    await client.broadcasts.removePublisher("bcast_123", "@new-pub", "@owner");

    expect(requests).toHaveLength(2);

    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toBe(
      "https://example.test/broadcasts/bcast_123/publishers",
    );
    expect(requests[0]!.headers.get("X-Agent-ID")).toBe("@owner");
    expect(requests[0]!.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    await expect(requests[0]!.json()).resolves.toEqual({ agentId: "@new-pub" });

    expect(requests[1]!.method).toBe("DELETE");
    expect(requests[1]!.url).toBe(
      "https://example.test/broadcasts/bcast_123/publishers/%40new-pub",
    );
    expect(requests[1]!.headers.get("X-Agent-ID")).toBe("@owner");
    expect(requests[1]!.headers.get("X-TinyPlace-Signature")).toBeTruthy();
  });
});
