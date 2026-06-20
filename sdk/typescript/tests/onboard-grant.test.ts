import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalPayload,
  LocalSigner,
  mintOnboardGrant,
  parseOnboardGrant,
  TinyPlaceClient,
} from "../src/index.js";

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(Buffer.from(base64, "base64"));
}

describe("onboarding bearer grant", () => {
  // Pins the exact bytes the wallet signs. The matching assertion lives in
  // backend/internal/onboardgrant/onboardgrant_test.go (TestCanonicalPayloadContract);
  // if you change either, change both.
  it("produces the cross-language canonical payload", () => {
    const payload = canonicalPayload("onboard.grant", {
      wallet: "Wallet111",
      ownerPublicKey: "OwnerKeyBase64",
      scope: ["user.email.start", "user.profile"],
      expiresAt: "2026-06-17T12:00:00Z",
    });
    expect(payload).toBe(
      '{"action":"onboard.grant","fields":{"expiresAt":"2026-06-17T12:00:00Z","ownerPublicKey":"OwnerKeyBase64","scope":["user.email.start","user.profile"],"wallet":"Wallet111"}}',
    );
  });

  it("mints a grant that round-trips through parseOnboardGrant", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(7));
    const credential = await mintOnboardGrant(
      signer,
      signer.publicKeyBase64,
      ["user.profile"],
      15 * 60 * 1000,
    );

    expect(credential.wallet).toBe(signer.agentId);
    expect(credential.grant.startsWith("og1.")).toBe(true);
    expect(credential.authorizationHeader()).toBe(
      `TinyPlace-Onboard ${signer.agentId}:${credential.grant}`,
    );

    expect(credential.ownerPublicKey).toBe(signer.publicKeyBase64);

    const parsed = parseOnboardGrant(credential.fragmentValue());
    expect(parsed?.wallet).toBe(signer.agentId);
    expect(parsed?.grant).toBe(credential.grant);
    // The public key is recovered from the token claims so the web flow can
    // publish a discovery card without holding the private key.
    expect(parsed?.ownerPublicKey).toBe(signer.publicKeyBase64);
  });

  it("signs the grant with a v1 freshness signature even for a SIWS-mode key", async () => {
    // LocalSigner defaults to SIWS auth. The grant signature must still be a real
    // v1 signature bound to the canonical onboard.grant payload — NOT the reusable
    // SIWS sign-in token, which signs a different message the backend rejects as
    // "invalid signature" (backend/internal/onboardgrant/onboardgrant.go).
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(11));
    // SIWS is active on this signer (the precondition the fix must survive).
    expect(signer.siwsSignature().startsWith("siws:")).toBe(true);

    const credential = await mintOnboardGrant(
      signer,
      signer.publicKeyBase64,
      ["user.profile"],
      15 * 60 * 1000,
    );

    // Token shape: og1.<b64url(claims)>.<signature>
    const rest = credential.grant.slice("og1.".length);
    const dot = rest.indexOf(".");
    const claimsBase64Url = rest.slice(0, dot);
    const signature = rest.slice(dot + 1);
    expect(signature.startsWith("v1:")).toBe(true);
    expect(signature.startsWith("siws:")).toBe(false);

    // The v1 signature must verify against the canonical payload the server
    // reconstructs from the claims, with the freshness ts/nonce appended.
    const claims = JSON.parse(
      Buffer.from(claimsBase64Url, "base64url").toString("utf8"),
    ) as {
      wallet: string;
      ownerPublicKey: string;
      scope: Array<string>;
      expiresAt: string;
    };
    const payload = canonicalPayload("onboard.grant", {
      expiresAt: claims.expiresAt,
      ownerPublicKey: claims.ownerPublicKey,
      scope: claims.scope,
      wallet: claims.wallet,
    });
    const [, timestampBase64Url, nonceBase64Url, signatureBase64] =
      signature.split(":");
    const timestamp = Buffer.from(
      base64UrlToBytes(timestampBase64Url!),
    ).toString("utf8");
    const nonce = Buffer.from(base64UrlToBytes(nonceBase64Url!)).toString(
      "utf8",
    );
    const signedBytes = new TextEncoder().encode(
      `${payload}\n${timestamp}\n${nonce}`,
    );
    const publicKey = await webcrypto.subtle.importKey(
      "raw",
      signer.publicKey,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const valid = await webcrypto.subtle.verify(
      "Ed25519",
      publicKey,
      Uint8Array.from(Buffer.from(signatureBase64!, "base64")),
      signedBytes,
    );
    expect(valid).toBe(true);
  });

  it("attaches the bearer header and omits the body signature on onboarding writes", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(9));
    const credential = await mintOnboardGrant(
      signer,
      signer.publicKeyBase64,
      ["user.profile"],
      15 * 60 * 1000,
    );

    const requests: Array<Request> = [];
    let bodyText = "";
    // Key-less client: no signer, only the bearer grant.
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      onboardGrant: credential,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        bodyText = (init?.body as string) ?? "";
        requests.push(request);
        return Response.json({
          cryptoId: signer.agentId,
          actorType: "human",
          displayName: "Ada",
          bio: "Updated bio.",
          emailVerified: false,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-02T00:00:00Z",
        });
      },
    });

    await client.users.updateProfile(signer.agentId, { bio: "Updated bio." });

    expect(requests).toHaveLength(1);
    expect(requests[0]!.headers.get("Authorization")).toBe(
      credential.authorizationHeader(),
    );
    const body = JSON.parse(bodyText) as { signature?: string };
    expect(body.signature).toBeUndefined();
  });

  it("rejects malformed fragment values", () => {
    expect(parseOnboardGrant("")).toBeUndefined();
    expect(parseOnboardGrant("nowallet")).toBeUndefined();
    expect(parseOnboardGrant("Wallet:not-a-grant")).toBeUndefined();
  });
});
