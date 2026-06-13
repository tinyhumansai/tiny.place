import { describe, expect, it } from "vitest";
import { LocalSigner, TinyVerseClient } from "../src/index.js";

describe("GroupsApi", () => {
  it("normalizes null group lists from staging-compatible responses", async () => {
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      fetch: async () => Response.json({ groups: null }),
    });

    await expect(client.groups.list({ limit: 3 })).resolves.toEqual({
      groups: [],
    });
  });

  it("signs group create, join, and message fanout requests as handle actors", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(27));
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.endsWith("/join")) {
          return Response.json({
            groupId: "group 1",
            agentId: "@member",
            role: "member",
            status: "active",
            joinedAt: "2026-06-13T00:00:00Z",
            updatedAt: "2026-06-13T00:00:00Z",
          });
        }
        if (request.url.endsWith("/messages")) {
          return Response.json(
            {
              groupId: "group 1",
              sourceMessageId: "msg_source",
              messageIds: { "@recipient": "group_msg_1" },
              recipients: ["@recipient"],
              fanout: 1,
            },
            { status: 202 },
          );
        }
        return Response.json({
          groupId: "group 1",
          name: "Research Guild",
          createdBy: "@owner",
          createdAt: "2026-06-13T00:00:00Z",
          membershipPolicy: "open",
          membershipEpoch: 1,
          memberCount: 1,
        });
      },
    });

    await client.groups.create({
      groupId: "group 1",
      name: "Research Guild",
      createdBy: "@owner",
      membershipPolicy: "open",
    });
    await client.groups.join("group 1", {
      agentId: "@member",
      paymentAuthorization: "signed-payment",
    });
    await client.groups.fanoutMessage("group 1", {
      id: "msg_source",
      from: "@sender",
      to: "group 1",
      timestamp: "2026-06-13T00:00:00.000Z",
      deviceId: 1,
      type: "CIPHERTEXT",
      body: "Y2lwaGVydGV4dA==",
      signal: {
        senderKeyId: "group 1:@sender:epoch:1",
        senderKeyIteration: 1,
      },
    });

    expect(requests).toHaveLength(3);

    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toBe("https://example.test/directory/groups");
    expect(requests[0]!.headers.get("X-Agent-ID")).toBe("@owner");
    expect(requests[0]!.headers.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    expect(requests[0]!.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    await expect(requests[0]!.json()).resolves.toMatchObject({
      groupId: "group 1",
      createdBy: "@owner",
    });

    expect(requests[1]!.method).toBe("POST");
    expect(requests[1]!.url).toBe(
      "https://example.test/directory/groups/group%201/join",
    );
    expect(requests[1]!.headers.get("X-Agent-ID")).toBe("@member");
    expect(requests[1]!.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    await expect(requests[1]!.json()).resolves.toEqual({
      agentId: "@member",
      paymentAuthorization: "signed-payment",
    });

    expect(requests[2]!.method).toBe("POST");
    expect(requests[2]!.url).toBe(
      "https://example.test/directory/groups/group%201/messages",
    );
    expect(requests[2]!.headers.get("X-Agent-ID")).toBe("@sender");
    expect(requests[2]!.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    await expect(requests[2]!.json()).resolves.toMatchObject({
      from: "@sender",
      to: "group 1",
    });
  });

  it("routes member subscription renewal to the live group endpoint", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(28));
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({});
      },
    });

    await client.groups.renewMemberSubscription("group 1", "@member", {
      paymentAuthorization: "x402-token",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toBe(
      "https://example.test/directory/groups/group%201/members/%40member/subscription/renew",
    );
    expect(requests[0]!.headers.get("X-Agent-ID")).toBe("@member");
    await expect(requests[0]!.json()).resolves.toEqual({
      paymentAuthorization: "x402-token",
    });
  });

  it("routes encrypted group message fanout to the live group endpoint", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(29));
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(
          {
            groupId: "group 1",
            sourceMessageId: "msg_source",
            messageIds: { "@recipient": "group_msg_1" },
            recipients: ["@recipient"],
            fanout: 1,
          },
          { status: 202 },
        );
      },
    });

    await client.groups.fanoutMessage("group 1", {
      id: "msg_source",
      from: "@sender",
      to: "group 1",
      timestamp: "2026-06-13T00:00:00.000Z",
      deviceId: 1,
      type: "CIPHERTEXT",
      body: "Y2lwaGVydGV4dA==",
      signal: {
        senderKeyId: "group 1:@sender:epoch:1",
        senderKeyIteration: 1,
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toBe(
      "https://example.test/directory/groups/group%201/messages",
    );
    expect(requests[0]!.headers.get("X-Agent-ID")).toBe("@sender");
    await expect(requests[0]!.json()).resolves.toMatchObject({
      id: "msg_source",
      from: "@sender",
      to: "group 1",
      type: "CIPHERTEXT",
      signal: {
        senderKeyId: "group 1:@sender:epoch:1",
        senderKeyIteration: 1,
      },
    });
  });
});
