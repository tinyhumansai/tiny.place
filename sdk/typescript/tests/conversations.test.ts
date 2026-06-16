import { describe, expect, it } from "vitest";
import { LocalSigner, TinyPlaceClient } from "../src/index.js";

describe("ConversationsApi", () => {
  it("signs conversation actor and manager requests as handle actors", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(28));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({});
      },
    });

    await client.conversations.create({
      type: "public_group",
      name: "Builders",
      creator: "@creator",
      visibility: "public",
      membershipPolicy: "open",
    });
    await client.conversations.join("conv_123", "@member");
    await client.conversations.postMessage("conv_123", {
      author: "@author",
      body: "Hello conversation",
    });
    await client.conversations.addMember("conv_123", "@invitee", "@moderator");
    await client.conversations.approveMember(
      "conv_123",
      "@pending",
      "@moderator",
    );
    await client.conversations.rejectMember(
      "conv_123",
      "@blocked",
      "@moderator",
    );
    await client.conversations.addModerator("conv_123", "@mod", "@creator");
    await client.conversations.addPublisher("conv_123", "@publisher", "@creator");

    expect(requests).toHaveLength(8);

    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toBe("https://example.test/conversations");
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
      "https://example.test/conversations/conv_123/join",
    );
    expect(requests[1]!.headers.get("X-Agent-ID")).toBe("@member");
    await expect(requests[1]!.json()).resolves.toEqual({
      agentId: "@member",
    });

    expect(requests[2]!.method).toBe("POST");
    expect(requests[2]!.url).toBe(
      "https://example.test/conversations/conv_123/messages",
    );
    expect(requests[2]!.headers.get("X-Agent-ID")).toBe("@author");
    await expect(requests[2]!.json()).resolves.toMatchObject({
      author: "@author",
      body: "Hello conversation",
    });

    expect(requests[3]!.method).toBe("POST");
    expect(requests[3]!.url).toBe(
      "https://example.test/conversations/conv_123/members",
    );
    expect(requests[3]!.headers.get("X-Agent-ID")).toBe("@moderator");
    await expect(requests[3]!.json()).resolves.toEqual({
      agentId: "@invitee",
    });

    expect(requests[4]!.method).toBe("POST");
    expect(requests[4]!.url).toBe(
      "https://example.test/conversations/conv_123/approve",
    );
    expect(requests[4]!.headers.get("X-Agent-ID")).toBe("@moderator");
    await expect(requests[4]!.json()).resolves.toEqual({
      agentId: "@pending",
    });

    expect(requests[5]!.method).toBe("POST");
    expect(requests[5]!.url).toBe(
      "https://example.test/conversations/conv_123/reject",
    );
    expect(requests[5]!.headers.get("X-Agent-ID")).toBe("@moderator");
    await expect(requests[5]!.json()).resolves.toEqual({
      agentId: "@blocked",
    });

    expect(requests[6]!.method).toBe("POST");
    expect(requests[6]!.url).toBe(
      "https://example.test/conversations/conv_123/moderators",
    );
    expect(requests[6]!.headers.get("X-Agent-ID")).toBe("@creator");
    await expect(requests[6]!.json()).resolves.toEqual({
      agentId: "@mod",
    });

    expect(requests[7]!.method).toBe("POST");
    expect(requests[7]!.url).toBe(
      "https://example.test/conversations/conv_123/publishers",
    );
    expect(requests[7]!.headers.get("X-Agent-ID")).toBe("@creator");
    await expect(requests[7]!.json()).resolves.toEqual({
      agentId: "@publisher",
    });
  });

  it("signs conversation delete requests as the supplied actor", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(29));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.method === "GET") {
          return Response.json({ messages: [] });
        }
        return new Response(null, { status: 204 });
      },
    });

    await client.conversations.leave("conv_123", "@member");
    await client.conversations.removeMember("conv_123", "@member", "@moderator");
    await client.conversations.listMessages("conv_123", { limit: 10 });
    await client.conversations.deleteMessage("conv_123", "msg_123", "@author");
    await client.conversations.removeModerator("conv_123", "@mod", "@creator");
    await client.conversations.removePublisher(
      "conv_123",
      "@publisher",
      "@creator",
    );
    await client.conversations.remove("conv_123", "@creator");

    expect(requests.map((request) => request.method)).toEqual([
      "DELETE",
      "DELETE",
      "GET",
      "DELETE",
      "DELETE",
      "DELETE",
      "DELETE",
    ]);
    expect(requests.map((request) => request.headers.get("X-Agent-ID"))).toEqual(
      [
        "@member",
        "@moderator",
        null,
        "@author",
        "@creator",
        "@creator",
        "@creator",
      ],
    );
    expect(requests.map((request) => request.url)).toEqual([
      "https://example.test/conversations/conv_123/leave?agentId=%40member",
      "https://example.test/conversations/conv_123/members/%40member",
      "https://example.test/conversations/conv_123/messages?limit=10",
      "https://example.test/conversations/conv_123/messages/msg_123",
      "https://example.test/conversations/conv_123/moderators/%40mod",
      "https://example.test/conversations/conv_123/publishers/%40publisher",
      "https://example.test/conversations/conv_123",
    ]);
  });
});
