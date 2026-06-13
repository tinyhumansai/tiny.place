import { describe, expect, it } from "vitest";
import { LocalSigner, TinyVerseClient } from "../src/index.js";

describe("AdminApi", () => {
  it("resolves fees with backend query parameters and response envelope", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(51));
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          fee: {
            feeId: "fee_default",
            scope: "global",
            transactionType: "PAYMENT",
            agents: [],
            rate: "0.002",
            effectiveFrom: "2026-06-13T00:00:00.000Z",
            createdBy: "system",
            reason: "default",
            revoked: false,
            updatedAt: "2026-06-13T00:00:00.000Z",
          },
        });
      },
    });

    const result = await client.admin.resolveFee({
      from: "@buyer",
      to: "@seller",
      type: "PAYMENT",
    });

    expect(result.fee.rate).toBe("0.002");
    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe(
      "https://example.test/admin/fees/resolve?from=%40buyer&to=%40seller&type=PAYMENT",
    );
    expect(requests[0]!.headers.get("Authorization")).toMatch(/^tiny\.place /);
  });

  it("returns saved config and sends optional update reason", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(52));
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          key: "settlement.batch_window",
          value: "120s",
          updatedBy: "Admin ops",
          updatedAt: "2026-06-13T00:00:00.000Z",
        });
      },
    });

    const result = await client.admin.setConfig(
      "settlement.batch_window",
      "120s",
      "faster batches",
    );

    expect(result.value).toBe("120s");
    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("PUT");
    expect(requests[0]!.url).toBe(
      "https://example.test/admin/config/settlement.batch_window",
    );
    await expect(requests[0]!.json()).resolves.toEqual({
      value: "120s",
      reason: "faster batches",
    });
  });

  it("lists audit entries using the backend audit envelope", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(53));
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          audit: [
            {
              auditId: "audit_1",
              action: "config.update",
              actor: "Admin ops",
              timestamp: "2026-06-13T00:00:00.000Z",
              params: { key: "settlement.batch_window" },
              reason: "faster batches",
            },
          ],
        });
      },
    });

    const result = await client.admin.audit({ limit: 10, offset: 20 });

    expect(result.audit).toHaveLength(1);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe(
      "https://example.test/admin/audit?limit=10&offset=20",
    );
  });

  it("returns fee metric breakdowns from the backend shape", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(54));
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async () =>
        Response.json({
          count: 2,
          total: "1200",
          last24h: "1000",
          last30d: "1000",
          byAsset: { "USDC:eip155:8453": "1200" },
          byNetwork: { "eip155:8453": "1200" },
          byTransactionType: { PAYMENT: "1200" },
          byAgent: { "@seller": "1000" },
        }),
    });

    const result = await client.admin.feeMetrics();

    expect(result.count).toBe(2);
    expect(result.total).toBe("1200");
    expect(result.byNetwork["eip155:8453"]).toBe("1200");
    expect(result.byTransactionType.PAYMENT).toBe("1200");
  });
});
