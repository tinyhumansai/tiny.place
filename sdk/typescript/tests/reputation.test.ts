import { describe, expect, it } from "vitest";
import { canonicalPayload, LocalSigner, TinyPlaceClient } from "../src/index.js";

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function verifySignature(
  signer: LocalSigner,
  signature: string,
  action: string,
  fields: Record<string, unknown>,
): Promise<boolean> {
  const publicKey = await globalThis.crypto.subtle.importKey(
    "raw",
    signer.publicKey,
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  return globalThis.crypto.subtle.verify(
    "Ed25519",
    publicKey,
    fromBase64(signature),
    new TextEncoder().encode(canonicalPayload(action, fields)),
  );
}

describe("ReputationApi", () => {
  it("exposes reputation leaderboard category filters", async () => {
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          leaderboard: "reputation",
          entries: [],
          updatedAt: "2026-06-13T00:00:00Z",
        });
      },
    });

    await client.reputation.reputationLeaderboard({
      category: "reviews",
      limit: 2,
    });
    await client.reputation.leaderboard(undefined, {
      category: "reviews",
      limit: 2,
    });

    expect(requests.map((request) => request.url)).toEqual([
      "https://example.test/reputation/leaderboard?category=reviews&limit=2",
      "https://example.test/leaderboards/reputation?category=reviews&limit=2",
    ]);
  });

  it("exposes dedicated leaderboard endpoint query options", async () => {
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          leaderboard: "test",
          entries: [],
          updatedAt: "2026-06-13T00:00:00Z",
        });
      },
    });

    await client.reputation.groupsLeaderboard({
      sort: "activity",
      period: "30d",
      limit: 5,
      offset: 10,
    });
    await client.reputation.sellersLeaderboard({
      sort: "rating",
      category: "dataset",
      period: "7d",
      limit: 3,
    });
    await client.reputation.gamesLeaderboard({
      sort: "roi",
      period: "90d",
      limit: 4,
    });

    expect(requests.map((request) => request.url)).toEqual([
      "https://example.test/leaderboards/groups?sort=activity&period=30d&limit=5&offset=10",
      "https://example.test/leaderboards/sellers?sort=rating&category=dataset&period=7d&limit=3",
      "https://example.test/leaderboards/games?sort=roi&period=90d&limit=4",
    ]);
  });

  it("signs review, vouch, and attestation create requests", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(14), { siws: false });
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({}, { status: 201 });
      },
    });

    await client.reputation.createReview({
      reviewer: "@reviewer",
      subject: "@subject",
      rating: 5,
      comment: "Fast settlement",
      context: "marketplace",
      transactionRef: "tx_123",
    });
    await client.reputation.createVouch({
      voucher: "@voucher",
      subject: "@subject",
      weight: 0.5,
      comment: "Known operator",
      context: "identity",
    });
    await client.reputation.createAttestation({
      agent: "@agent",
      agentCryptoId: signer.agentId,
      platform: "github",
      handle: "agent",
      proofUrl: "https://github.com/agent/.well-known/tinyplace.json",
    });

    const reviewBody = (await requests[0]!.json()) as {
      reviewer: string;
      subject: string;
      rating: number;
      comment: string;
      context: string;
      transactionRef: string;
      reviewId: string;
      signature: string;
    };
    expect(reviewBody.reviewId).toMatch(/^rev_/);
    await expect(
      verifySignature(signer, reviewBody.signature, "reputation.review", {
        comment: reviewBody.comment,
        context: reviewBody.context,
        rating: reviewBody.rating,
        reviewer: reviewBody.reviewer,
        subject: reviewBody.subject,
        transactionRef: reviewBody.transactionRef,
      }),
    ).resolves.toBe(true);

    const vouchBody = (await requests[1]!.json()) as {
      vouchId: string;
      voucher: string;
      subject: string;
      weight: number;
      comment: string;
      context: string;
      signature: string;
    };
    expect(vouchBody.vouchId).toMatch(/^vouch_/);
    await expect(
      verifySignature(signer, vouchBody.signature, "reputation.vouch", {
        comment: vouchBody.comment,
        context: vouchBody.context,
        subject: vouchBody.subject,
        vouchId: vouchBody.vouchId,
        voucher: vouchBody.voucher,
        weight: vouchBody.weight,
      }),
    ).resolves.toBe(true);

    const attestationBody = (await requests[2]!.json()) as {
      attestationId: string;
      agent: string;
      agentCryptoId: string;
      platform: string;
      handle: string;
      proofUrl: string;
      signature: string;
    };
    expect(attestationBody.attestationId).toMatch(/^att_/);
    await expect(
      verifySignature(
        signer,
        attestationBody.signature,
        "reputation.attestation",
        {
          agent: attestationBody.agent,
          agentCryptoId: attestationBody.agentCryptoId,
          handle: attestationBody.handle,
          platform: attestationBody.platform,
          proofUrl: attestationBody.proofUrl,
        },
      ),
    ).resolves.toBe(true);
  });

  it("signs vouch and attestation revocations in the query string", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(15), { siws: false });
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(null, { status: 204 });
      },
    });

    await client.reputation.deleteVouch("vouch_123");
    await client.reputation.deleteAttestation("att_123");

    const vouchUrl = new URL(requests[0]!.url);
    const vouchSignature = vouchUrl.searchParams.get("signature");
    expect(vouchSignature).toBeTruthy();
    await expect(
      verifySignature(signer, vouchSignature!, "reputation.vouch.revoke", {
        vouchId: "vouch_123",
      }),
    ).resolves.toBe(true);

    const attestationUrl = new URL(requests[1]!.url);
    const attestationSignature =
      attestationUrl.searchParams.get("signature");
    expect(attestationSignature).toBeTruthy();
    await expect(
      verifySignature(
        signer,
        attestationSignature!,
        "reputation.attestation.revoke",
        { attestationId: "att_123" },
      ),
    ).resolves.toBe(true);
  });
});
