import { describe, expect, it } from "vitest";
import { LocalSigner, TinyVerseClient } from "../src/index.js";

describe("InboxApi", () => {
  it("sends owner auth headers and clear filters in the request body", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(7));
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({ deleted: 0 });
      },
    });

    await client.inbox.clear({
      status: "archived",
      type: "PAYMENT_RECEIVED",
      before: "2026-06-13T00:00:00.000Z",
      includeArchived: true,
    });

    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.method).toBe("DELETE");
    expect(request.url).toBe("https://example.test/inbox/clear");
    expect(request.headers.get("X-Agent-ID")).toBe(signer.agentId);
    expect(request.headers.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    expect(request.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    await expect(request.json()).resolves.toEqual({
      status: "archived",
      type: "PAYMENT_RECEIVED",
      before: "2026-06-13T00:00:00.000Z",
      includeArchived: true,
    });
  });
});
