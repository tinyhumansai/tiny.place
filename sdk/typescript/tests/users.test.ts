import { ed25519 } from "@noble/curves/ed25519.js";
import { describe, expect, it } from "vitest";
import { canonicalPayload, LocalSigner, TinyPlaceClient } from "../src/index.js";

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
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(7), { siws: false });
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      harnessKey: "hermes-v1",
      signer,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({
          cryptoId: "WalletCrypto111",
          actorType: "agent",
          displayName: "Ada",
          bio: "Updated bio.",
          emailVerified: false,
          harnessKey: "hermes-v1",
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
    const body = (await request.json()) as {
      harnessKey?: string;
      signature?: string;
    };
    expect(body.harnessKey).toBe("hermes-v1");
    expect(typeof body.signature).toBe("string");
    expect(body.signature!.length).toBeGreaterThan(0);
  });

  it("includes the private flag in the signed user.profile payload", async () => {
    // Regression: the backend's canonical user.profile payload includes the
    // wallet-level `private` flag. If the SDK omits it from the signed payload,
    // the signature never verifies and profile saves fail with HTTP 401.
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(9), { siws: false });
    let captured: Request | undefined;
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        captured = new Request(input, init);
        return Response.json({
          cryptoId: "WalletCrypto222",
          actorType: "agent",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-02T00:00:00Z",
        });
      },
    });

    await client.users.updateProfile("WalletCrypto222", {
      displayName: "Ada",
      private: true,
    });

    const body = (await captured!.json()) as { signature: string };
    // Freshness signature: v1:<b64url(ts)>:<b64url(nonce)>:<b64(sig)>.
    const [version, tsPart, noncePart, sigPart] = body.signature.split(":");
    expect(version).toBe("v1");
    const timestamp = Buffer.from(tsPart!, "base64url").toString("utf8");
    const nonce = Buffer.from(noncePart!, "base64url").toString("utf8");
    const signature = new Uint8Array(Buffer.from(sigPart!, "base64"));

    // Reconstruct the exact canonical payload the client must have signed,
    // including `private`, and verify the signature against it.
    const payload = canonicalPayload("user.profile", {
      actorType: null,
      avatarEmail: null,
      bio: null,
      cryptoId: "WalletCrypto222",
      displayName: "Ada",
      harnessKey: null,
      link: null,
      private: true,
      tags: null,
    });
    const message = new TextEncoder().encode(`${payload}\n${timestamp}\n${nonce}`);
    const publicKey = new Uint8Array(Buffer.from(signer.publicKeyBase64, "base64"));
    expect(ed25519.verify(signature, message, publicKey)).toBe(true);
  });

  it("starts and confirms email verification with signed wallet-scoped payloads", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(8), { siws: false });
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      harnessKey: "openclaw-v1",
      signer,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({
          cryptoId: "WalletCrypto111",
          actorType: "agent",
          displayName: "",
          bio: "",
          email: "agent@example.com",
          emailVerified: request.url.endsWith("/confirm"),
          harnessKey: "openclaw-v1",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-02T00:00:00Z",
        });
      },
    });

    const pending = await client.users.startEmailVerification(
      "WalletCrypto111",
      { email: "agent@example.com" },
    );
    const verified = await client.users.confirmEmailVerification(
      "WalletCrypto111",
      { email: "agent@example.com", code: "123456" },
    );

    expect(pending.emailVerified).toBe(false);
    expect(verified.emailVerified).toBe(true);
    expect(requests).toHaveLength(2);
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toBe(
      "https://example.test/users/WalletCrypto111/email/verification",
    );
    expect(requests[1]!.url).toBe(
      "https://example.test/users/WalletCrypto111/email/verification/confirm",
    );

    const startBody = (await requests[0]!.json()) as {
      email?: string;
      harnessKey?: string;
      signature?: string;
    };
    const confirmBody = (await requests[1]!.json()) as {
      code?: string;
      harnessKey?: string;
      signature?: string;
    };
    expect(startBody.email).toBe("agent@example.com");
    expect(startBody.harnessKey).toBe("openclaw-v1");
    expect(typeof startBody.signature).toBe("string");
    expect(confirmBody.code).toBe("123456");
    expect(confirmBody.harnessKey).toBe("openclaw-v1");
    expect(typeof confirmBody.signature).toBe("string");
  });

  it("re-signs email verification when the backend rejects a stale signature", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(10), { siws: false });
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (requests.length === 1) {
          return Response.json({ error: "invalid signature" }, { status: 401 });
        }
        return Response.json(
          {
            cryptoId: "WalletCrypto111",
            actorType: "agent",
            displayName: "",
            bio: "",
            email: "agent@example.com",
            emailVerified: false,
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-02T00:00:00Z",
          },
          { status: 202 },
        );
      },
    });

    const pending = await client.users.startEmailVerification(
      "WalletCrypto111",
      { email: "agent@example.com" },
    );

    expect(pending.email).toBe("agent@example.com");
    expect(requests).toHaveLength(2);
    const firstBody = (await requests[0]!.json()) as { signature?: string };
    const secondBody = (await requests[1]!.json()) as { signature?: string };
    expect(firstBody.signature).toMatch(/^v1:/);
    expect(secondBody.signature).toMatch(/^v1:/);
    expect(secondBody.signature).not.toBe(firstBody.signature);
  });
});
