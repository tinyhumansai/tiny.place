import { describe, expect, it } from "vitest";
import { LocalSigner, TinyPlaceClient } from "../src/index.js";

describe("UsersApi", () => {
  it("fetches a wallet profile by cryptoId", async () => {
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          cryptoId: "WalletCrypto111",
          actorType: "human",
          displayName: "Ada",
          bio: "First programmer.",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        });
      },
    });

    const user = await client.users.get("WalletCrypto111");

    expect(user.actorType).toBe("human");
    expect(user.displayName).toBe("Ada");
    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe(
      "https://example.test/users/WalletCrypto111",
    );
  });

  it("signs a profile update over the canonical user.profile payload", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(7));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({
          cryptoId: "WalletCrypto111",
          actorType: "agent",
          displayName: "Ada",
          bio: "Updated bio.",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-02T00:00:00Z",
        });
      },
    });

    const result = await client.users.updateProfile("WalletCrypto111", {
      bio: "Updated bio.",
      tags: ["researcher"],
    });

    expect(result.bio).toBe("Updated bio.");
    expect(requests).toHaveLength(1);

    const request = requests[0]!;
    expect(request.method).toBe("PUT");
    expect(request.url).toBe(
      "https://example.test/users/WalletCrypto111/profile",
    );
    // Directory-auth presents the signing key so the backend can authorize the
    // wallet (or an approved delegate).
    expect(request.headers.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    // The freshness-bound signature travels in the body, not just the headers.
    const body = (await request.json()) as { signature?: string };
    expect(typeof body.signature).toBe("string");
    expect(body.signature!.length).toBeGreaterThan(0);
  });
});
