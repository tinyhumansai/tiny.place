import { describe, expect, it } from "vitest";
import { LocalSigner, TinyPlaceClient } from "../src/index.js";

describe("SignersApi", () => {
  it("lists approved signers for the authenticated grantor", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(41));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          signers: [
            {
              signerKey: "session-key",
              grantor: signer.agentId,
              network: "eip155:8453",
              asset: "USDC",
              budget: "1000000",
              spent: "0",
              remaining: "1000000",
              expiresAt: "2026-06-20T00:00:00.000Z",
              nonce: "signer_nonce",
              status: "active",
              createdAt: "2026-06-13T00:00:00.000Z",
            },
          ],
        });
      },
    });

    const result = await client.signers.list(signer.agentId);

    expect(result.signers).toHaveLength(1);
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.method).toBe("GET");
    expect(request.url).toBe(
      `https://example.test/signers?grantor=${encodeURIComponent(signer.agentId)}`,
    );
    expect(request.headers.get("Authorization")).toBeNull();
    expect(request.headers.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    expect(request.headers.get("X-TinyPlace-Signature")).toBeTruthy();
  });

  it("gets and revokes signer approvals with grantor query auth", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(42));
    const requests: Array<Request> = [];
    const approval = {
      signerKey: "session-key",
      grantor: signer.agentId,
      network: "eip155:8453",
      asset: "USDC",
      budget: "1000000",
      spent: "0",
      remaining: "1000000",
      expiresAt: "2026-06-20T00:00:00.000Z",
      nonce: "signer_nonce",
      status: "active",
      createdAt: "2026-06-13T00:00:00.000Z",
    };
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(approval);
      },
    });

    await client.signers.get("session-key", signer.agentId);
    await client.signers.revoke("session-key", signer.agentId);

    expect(requests).toHaveLength(2);
    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe(
      `https://example.test/signers/session-key?grantor=${encodeURIComponent(signer.agentId)}`,
    );
    expect(requests[1]!.method).toBe("DELETE");
    expect(requests[1]!.url).toBe(
      `https://example.test/signers/session-key?grantor=${encodeURIComponent(signer.agentId)}`,
    );
    for (const request of requests) {
      expect(request.headers.get("Authorization")).toBeNull();
      expect(request.headers.get("X-TinyPlace-Public-Key")).toBe(
        signer.publicKeyBase64,
      );
      expect(request.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    }
  });

  it("consumes a single-use signer grant with session-key auth", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(43));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          signerKey: "session-key",
          grantor: signer.agentId,
          network: "eip155:8453",
          asset: "USDC",
          budget: "1",
          spent: "0",
          remaining: "1",
          expiresAt: "2026-06-20T00:00:00.000Z",
          nonce: "signer_nonce",
          status: "active",
          createdAt: "2026-06-13T00:00:00.000Z",
          consumedAt: "2026-06-13T00:05:00.000Z",
        });
      },
    });

    const result = await client.signers.consume("session-key");

    expect(result.consumedAt).toBe("2026-06-13T00:05:00.000Z");
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.method).toBe("POST");
    expect(request.url).toBe("https://example.test/signers/session-key/consume");
    // Authenticated as the session key (directory write auth), not a bearer.
    expect(request.headers.get("Authorization")).toBeNull();
    expect(request.headers.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    expect(request.headers.get("X-TinyPlace-Signature")).toBeTruthy();
  });
});
