import { describe, expect, it } from "vitest";
import { TinyPlaceClient } from "../src/index.js";

describe("harness capability parity", () => {
  it("exposes the documented harness capability families through the Node SDK", () => {
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async () => Response.json({}),
    });

    const capabilityMethods: Record<string, Array<[string, string]>> = {
      identity: [
        ["registry", "register"],
        ["registry", "get"],
        ["registry", "updateProfileVisibility"],
        ["registry", "exportIdentity"],
        ["directory", "resolve"],
      ],
      directory: [
        ["directory", "listAgents"],
        ["directory", "getAgent"],
        ["groups", "list"],
        ["directory", "skills"],
      ],
      channels: [
        ["channels", "list"],
        ["channels", "get"],
        ["channels", "create"],
        ["channels", "postMessage"],
        ["channels", "members"],
      ],
      broadcasts: [
        ["broadcasts", "list"],
        ["broadcasts", "get"],
        ["broadcasts", "create"],
        ["broadcasts", "subscribe"],
        ["broadcasts", "postMessage"],
      ],
      messaging: [
        ["messages", "send"],
        ["messages", "list"],
        ["messages", "acknowledge"],
        ["keys", "getBundle"],
        ["keys", "health"],
        ["a2a", "sendTask"],
      ],
      inbox: [
        ["inbox", "list"],
        ["inbox", "markRead"],
        ["inbox", "archive"],
        ["inbox", "stream"],
      ],
      marketplace: [
        ["marketplace", "browseMarketplace"],
        ["marketplace", "getProduct"],
        ["marketplace", "createProduct"],
        ["marketplace", "buyProduct"],
        ["marketplace", "createProductReview"],
      ],
      reputation: [
        ["reputation", "getScore"],
        ["reputation", "createAttestation"],
        ["reputation", "leaderboard"],
      ],
      pricing: [
        ["pricing", "quote"],
        ["pricing", "history"],
        ["pricing", "assets"],
        ["pricing", "pairs"],
        ["pricing", "networks"],
        ["pricing", "gas"],
      ],
      signers: [
        ["signers", "approve"],
        ["signers", "list"],
        ["signers", "get"],
        ["signers", "revoke"],
      ],
      payments: [
        ["payments", "settle"],
        ["payments", "verify"],
        ["payments", "supported"],
        ["payments", "createSubscription"],
        ["payments", "cancelSubscription"],
      ],
      ledger: [
        ["ledger", "list"],
        ["ledger", "get"],
        ["ledger", "verify"],
        ["ledger", "stream"],
      ],
    };

    for (const [capability, methods] of Object.entries(capabilityMethods)) {
      for (const [namespace, method] of methods) {
        const api = client[namespace as keyof TinyPlaceClient] as Record<string, unknown>;
        expect(api, `${capability}.${namespace}`).toBeTruthy();
        expect(typeof api[method], `${capability}.${namespace}.${method}`).toBe("function");
      }
    }
  });
});
