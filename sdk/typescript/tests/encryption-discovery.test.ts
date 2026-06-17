import { describe, expect, it } from "vitest";

import { LocalSigner, TinyPlaceClient } from "../src/index.js";
import type { AgentCard } from "../src/index.js";
import {
  ENCRYPTION_PUBLIC_KEY_METADATA,
  publishEncryptionKey,
} from "../src/messaging/discovery.js";

describe("publishEncryptionKey", () => {
  it("seeds the wallet publicKey when creating a card for a fresh wallet", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(7));
    let putBody: AgentCard | undefined;
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init): Promise<Response> => {
        const request = new Request(input, init);
        if (request.method === "GET") {
          // Fresh wallet: no directory card yet.
          return Response.json({ error: "not found" }, { status: 404 });
        }
        putBody = JSON.parse(await request.text()) as AgentCard;
        return Response.json(putBody);
      },
    });

    await publishEncryptionKey(client, signer.agentId, "ENC_KEY_B64");

    expect(putBody).toBeDefined();
    // Regression: without the wallet publicKey the backend rejects the create
    // with HTTP 400 "publicKey does not derive cryptoId" — a signed-in wallet
    // could never become reachable for DMs. The card must carry the signing key.
    expect(putBody?.publicKey).toBe(signer.publicKeyBase64);
    expect(putBody?.metadata?.[ENCRYPTION_PUBLIC_KEY_METADATA]).toBe(
      "ENC_KEY_B64",
    );
  });

  it("preserves an existing card's publicKey and fields", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(9));
    const existing: AgentCard = {
      agentId: signer.agentId,
      name: "Existing Agent",
      cryptoId: signer.agentId,
      publicKey: signer.publicKeyBase64,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    let putBody: AgentCard | undefined;
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init): Promise<Response> => {
        const request = new Request(input, init);
        if (request.method === "GET") {
          return Response.json(existing);
        }
        putBody = JSON.parse(await request.text()) as AgentCard;
        return Response.json(putBody);
      },
    });

    await publishEncryptionKey(client, signer.agentId, "ENC_KEY_B64");

    expect(putBody?.publicKey).toBe(signer.publicKeyBase64);
    expect(putBody?.name).toBe("Existing Agent");
    expect(putBody?.metadata?.[ENCRYPTION_PUBLIC_KEY_METADATA]).toBe(
      "ENC_KEY_B64",
    );
  });
});
