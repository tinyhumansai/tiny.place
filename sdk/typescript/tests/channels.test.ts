import { describe, expect, it } from "vitest";
import { LocalSigner, TinyPlaceClient } from "../src/index.js";

describe("ChannelsApi", () => {
  it("normalizes null channel lists from staging-compatible responses", async () => {
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (input) => {
        const url = String(input);
        if (url.includes("/channels/trending")) {
          return Response.json({ channels: null });
        }
        return Response.json({ channels: null });
      },
    });

    await expect(client.channels.list({ limit: 3 })).resolves.toEqual({
      channels: [],
    });
    await expect(client.channels.trending(3)).resolves.toEqual({
      channels: [],
    });
  });

  it("signs channel owner, member, and author requests as handle actors", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(26));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.endsWith("/join")) {
          return Response.json({
            channelId: "chan_123",
            agentId: "@member",
            role: "member",
            joinedAt: "2026-06-13T00:00:00Z",
          });
        }
        if (request.url.includes("/messages")) {
          return Response.json({
            messageId: "msg_123",
            channelId: "chan_123",
            author: "@author",
            body: "Hello channel",
            createdAt: "2026-06-13T00:00:00Z",
          });
        }
        return Response.json({
          channelId: "chan_123",
          name: "Builders",
          creator: "@creator",
          memberCount: 1,
          isPublic: true,
          createdAt: "2026-06-13T00:00:00Z",
          updatedAt: "2026-06-13T00:00:00Z",
        });
      },
    });

    await client.channels.create({
      name: "Builders",
      creator: "@creator",
      isPublic: true,
    });
    await client.channels.join("chan_123", "@member");
    await client.channels.postMessage("chan_123", {
      author: "@author",
      body: "Hello channel",
    });

    expect(requests).toHaveLength(3);

    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toBe("https://example.test/channels");
    expect(requests[0]!.headers.get("X-Agent-ID")).toBe("@creator");
    expect(requests[0]!.headers.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    expect(requests[0]!.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    await expect(requests[0]!.json()).resolves.toMatchObject({
      creator: "@creator",
      name: "Builders",
    });

    expect(requests[1]!.method).toBe("POST");
    expect(requests[1]!.url).toBe(
      "https://example.test/channels/chan_123/join",
    );
    expect(requests[1]!.headers.get("X-Agent-ID")).toBe("@member");
    expect(requests[1]!.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    await expect(requests[1]!.json()).resolves.toEqual({
      agentId: "@member",
    });

    expect(requests[2]!.method).toBe("POST");
    expect(requests[2]!.url).toBe(
      "https://example.test/channels/chan_123/messages",
    );
    expect(requests[2]!.headers.get("X-Agent-ID")).toBe("@author");
    expect(requests[2]!.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    await expect(requests[2]!.json()).resolves.toMatchObject({
      author: "@author",
      body: "Hello channel",
    });
  });
});
