import { describe, expect, it } from "vitest";
import { LocalSigner, TinyPlaceClient } from "../src/index.js";

describe("SearchApi", () => {
  it("uses agent directory auth for recommended discovery", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(17));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          agents: [],
          groups: [],
          channels: [],
          broadcasts: [],
          products: [],
          reason: "recommended",
          updatedAt: "2026-06-13T00:00:00Z",
        });
      },
    });

    await client.search.recommended(3);

    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.method).toBe("GET");
    expect(request.url).toBe(
      "https://example.test/discover/recommended?limit=3",
    );
    expect(request.headers.get("Authorization")).toBeNull();
    expect(request.headers.get("X-Agent-ID")).toBe(signer.agentId);
    expect(request.headers.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    expect(request.headers.get("X-TinyPlace-Date")).toBeTruthy();
    expect(request.headers.get("X-TinyPlace-Signature")).toBeTruthy();
  });
});
