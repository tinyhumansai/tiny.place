import { describe, expect, it } from "vitest";
import {
  assertSupportedDeliveryMethod,
  buyProduct,
  postJob,
  resolveOwnHandle,
  subscribeBroadcast,
} from "../src/agent/index.js";
import { LocalSigner, TinyPlaceClient, TinyPlaceError } from "../src/index.js";

const CHALLENGE = {
  scheme: "exact",
  network: "solana:mainnet",
  asset: "USDC",
  amount: "1000000",
  to: "treasury",
};

function clientWith(overrides: Record<string, unknown>): TinyPlaceClient {
  return overrides as unknown as TinyPlaceClient;
}

async function signer(): Promise<LocalSigner> {
  return LocalSigner.generate({ siws: false });
}

describe("createProduct delivery-method guard", () => {
  it("rejects unsupported methods client-side", () => {
    expect(assertSupportedDeliveryMethod("download")).toBe("download");
    expect(() => assertSupportedDeliveryMethod("encrypted-message")).toThrow(
      /not supported via the CLI/,
    );
    expect(() => assertSupportedDeliveryMethod("smoke-signal")).toThrow(
      /unknown delivery method/,
    );
  });
});

describe("postJob", () => {
  it("maps the budget into the create request and summarizes", async () => {
    let captured: { client?: string; budget?: { amount: string } } = {};
    const client = clientWith({
      jobs: {
        create: async (request: typeof captured) => {
          captured = request;
          return {
            jobId: "job_1",
            client: request.client,
            title: "Design",
            status: "open",
            budget: { amount: "10", asset: "USDC" },
            proposalCount: 0,
          };
        },
      },
    });
    const me = await signer();
    const job = await postJob(client, me, {
      title: "Design",
      amount: "10",
      asset: "USDC",
    });
    expect(captured.client).toBe(me.agentId);
    expect(captured.budget?.amount).toBe("10");
    expect(job).toMatchObject({ jobId: "job_1", amount: "10", asset: "USDC" });
  });
});

describe("buyProduct", () => {
  it("settles an x402 challenge and reports the paid amount/asset", async () => {
    let calls = 0;
    const client = clientWith({
      marketplace: {
        buyProduct: async (_id: string, request: { payment?: unknown }) => {
          calls += 1;
          if (!request.payment) {
            throw new TinyPlaceError(402, { payment: CHALLENGE });
          }
          return {
            productId: "prod_1",
            purchaseId: "buy_1",
            seller: "seller",
            ledgerTxId: "tx_1",
          };
        },
      },
    });
    const result = await buyProduct(client, await signer(), "prod_1");
    expect(calls).toBe(2);
    expect(result).toMatchObject({
      productId: "prod_1",
      purchaseId: "buy_1",
      status: "settled",
      paidAmount: "1000000",
      paidAsset: "USDC",
    });
  });
});

describe("subscribeBroadcast", () => {
  it("passes a paymentAuthorization signature after an x402 challenge", async () => {
    let authorization: string | undefined;
    const client = clientWith({
      broadcasts: {
        subscribe: async (
          _id: string,
          request: { paymentAuthorization?: string },
        ) => {
          if (!request.paymentAuthorization) {
            throw new TinyPlaceError(402, { payment: CHALLENGE });
          }
          authorization = request.paymentAuthorization;
          return {
            agentId: "me",
            status: "active",
            subscribedAt: "2026-06-20T00:00:00.000Z",
          };
        },
      },
    });
    const result = await subscribeBroadcast(client, await signer(), "b_1");
    expect(result.status).toBe("active");
    expect(authorization).toBeTruthy();
  });
});

describe("resolveOwnHandle", () => {
  it("prefers the active primary handle from the directory reverse lookup", async () => {
    const client = clientWith({
      directory: {
        reverse: async () => ({
          identities: [
            { username: "alt", status: "active", expiresAt: "", primary: false },
            { username: "main", status: "active", expiresAt: "", primary: true },
          ],
          agents: [],
        }),
      },
    });
    expect(await resolveOwnHandle(client, await signer())).toBe("@main");
  });

  it("honors an explicit override", async () => {
    expect(
      await resolveOwnHandle(clientWith({}), await signer(), "chosen"),
    ).toBe("@chosen");
  });
});
