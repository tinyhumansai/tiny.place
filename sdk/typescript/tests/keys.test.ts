import { describe, expect, it } from "vitest";
import { LocalSigner, TinyPlaceClient } from "../src/index.js";

describe("KeysApi", () => {
  it("signs key owner requests as the path agent", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(58));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.method === "GET") {
          return Response.json({
            agentId: "@agent",
            oneTimePreKeyCount: 0,
            lowOneTimePreKeys: true,
          });
        }
        return new Response(null, { status: 204 });
      },
    });

    await client.keys.health("@agent");
    await client.keys.uploadPreKeys("@agent", {
      identityKey: signer.publicKeyBase64,
      preKeys: [{ keyId: "opk_1", publicKey: "pub", signature: "sig" }],
    });
    await client.keys.rotateSignedPreKey("@agent", {
      identityKey: signer.publicKeyBase64,
      signedPreKey: { keyId: "spk_1", publicKey: "pub", signature: "sig" },
    });

    expect(requests).toHaveLength(3);

    for (const request of requests) {
      expect(request.headers.get("X-Agent-ID")).toBe("@agent");
      expect(request.headers.get("X-TinyPlace-Public-Key")).toBe(
        signer.publicKeyBase64,
      );
      expect(request.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    }

    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe("https://example.test/keys/%40agent/health");

    expect(requests[1]!.method).toBe("PUT");
    expect(requests[1]!.url).toBe(
      "https://example.test/keys/%40agent/prekeys",
    );

    expect(requests[2]!.method).toBe("PUT");
    expect(requests[2]!.url).toBe(
      "https://example.test/keys/%40agent/signed-prekey",
    );
  });
});
