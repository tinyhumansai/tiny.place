import { describe, expect, it } from "vitest";
import {
  buyDomain,
  checkDomain,
  discoverAgents,
  resolveHandle,
} from "../src/agent/index.js";
import { LocalSigner, TinyPlaceClient, TinyPlaceError } from "../src/index.js";

const IDENTITY = {
  username: "@demo",
  cryptoId: "demoCryptoId",
  status: "active",
  registeredAt: "2026-06-17T00:00:00.000Z",
  expiresAt: "2027-06-17T00:00:00.000Z",
};

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

describe("checkDomain", () => {
  it("reports availability and the owner when taken", async () => {
    const client = clientWith({
      registry: {
        get: async () => ({
          available: false,
          identity: { cryptoId: "ownerXYZ" },
        }),
      },
    });
    await expect(checkDomain(client, "demo")).resolves.toEqual({
      name: "@demo",
      available: false,
      owner: "ownerXYZ",
    });
  });
});

describe("buyDomain", () => {
  it("registers free when no payment is required", async () => {
    let calls = 0;
    const client = clientWith({
      registry: {
        register: async () => {
          calls += 1;
          return IDENTITY;
        },
      },
    });
    const signer = await LocalSigner.generate({ siws: false });
    const result = await buyDomain(client, signer, "demo");
    expect(calls).toBe(1);
    expect(result.username).toBe("@demo");
    expect(result.paidAmount).toBeUndefined();
  });

  it("settles an x402 challenge and reports the paid amount/asset", async () => {
    let calls = 0;
    const client = clientWith({
      registry: {
        register: async (request: { payment?: unknown }) => {
          calls += 1;
          if (!request.payment) {
            throw new TinyPlaceError(402, {
              error: "payment required",
              payment: CHALLENGE,
            });
          }
          return IDENTITY;
        },
      },
    });
    const signer = await LocalSigner.generate({ siws: false });
    const result = await buyDomain(client, signer, "demo");
    expect(calls).toBe(2);
    expect(result).toMatchObject({
      username: "@demo",
      paidAmount: "1000000",
      paidAsset: "USDC",
    });
  });
});

describe("resolveHandle", () => {
  it("returns a clean not-found result on a 404", async () => {
    const client = clientWith({
      directory: {
        resolve: async () => {
          throw new TinyPlaceError(404, { error: "missing" });
        },
      },
    });
    await expect(resolveHandle(client, "ghost")).resolves.toEqual({
      name: "@ghost",
      found: false,
    });
  });

  it("surfaces the owning wallet when found", async () => {
    const client = clientWith({
      directory: {
        resolve: async () => ({
          identity: { cryptoId: "abc", publicKey: "pk", status: "active" },
          agent: { name: "Iris" },
        }),
      },
    });
    await expect(resolveHandle(client, "@iris")).resolves.toMatchObject({
      name: "@iris",
      found: true,
      cryptoId: "abc",
      agentName: "Iris",
    });
  });
});

describe("discoverAgents", () => {
  it("coerces mixed string/object skill shapes to plain names", async () => {
    const client = clientWith({
      directory: {
        listAgents: async () => ({
          agents: [
            {
              agentId: "a1",
              name: "Agent One",
              skills: ["translate", { name: "summarize" }, { id: "code" }],
            },
          ],
        }),
      },
    });
    const [agent] = await discoverAgents(client, { skill: "translate" });
    expect(agent.skills).toEqual(["translate", "summarize", "code"]);
  });
});
