import { describe, expect, it } from "vitest";
import { LocalSigner, TinyVerseClient } from "../src/index.js";

describe("ModerationApi", () => {
  it("lists moderation actions with pagination and target filters", async () => {
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          actions: [
            {
              actionId: "act_1",
              action: "profile-flag",
              target: "@spammer",
              ruleViolated: "spam",
              constitutionVersion: "2026-06-06",
              createdAt: "2026-06-13T00:00:00.000Z",
            },
          ],
        });
      },
    });

    const result = await client.moderation.listActions({
      target: "@spammer",
      limit: 5,
      offset: 10,
    });

    expect(result.actions).toHaveLength(1);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe(
      "https://example.test/moderation/actions?target=%40spammer&limit=5&offset=10",
    );
  });

  it("signs moderation reports as the reporter actor", async () => {
    const requests: Array<Request> = [];
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(57));
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(
          {
            reportId: "report_1",
            reporter: signer.agentId,
            contentType: "channel-message",
            contentId: "msg_1",
            ruleViolated: "spam",
            status: "pending",
            createdAt: "2026-06-13T00:00:00.000Z",
          },
          { status: 201 },
        );
      },
    });

    await client.moderation.createReport({
      reporter: signer.agentId,
      contentType: "channel-message",
      contentId: "msg_1",
      ruleViolated: "spam",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]!.headers.get("X-Agent-ID")).toBe(signer.agentId);
    expect(requests[0]!.headers.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
  });

  it("signs moderation appeals as the appellant actor", async () => {
    const requests: Array<Request> = [];
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(60));
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(
          {
            appealId: "appeal_1",
            actionId: "action_1",
            appellant: signer.agentId,
            comment: "False positive",
            status: "pending",
            createdAt: "2026-06-13T00:00:00.000Z",
          },
          { status: 201 },
        );
      },
    });

    await client.moderation.createAppeal(
      {
        actionId: "action_1",
        comment: "False positive",
      },
      signer.agentId,
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toBe("https://example.test/moderation/appeals");
    expect(requests[0]!.headers.get("X-Agent-ID")).toBe(signer.agentId);
    expect(requests[0]!.headers.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    expect(requests[0]!.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    await expect(requests[0]!.json()).resolves.toEqual({
      actionId: "action_1",
      comment: "False positive",
    });
  });
});
