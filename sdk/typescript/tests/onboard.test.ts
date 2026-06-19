import { describe, expect, it } from "vitest";
import { TinyPlaceClient } from "../src/index.js";

describe("OnboardApi", () => {
  it("createHandoff POSTs the grant fragment to /onboard/handoff", async () => {
    const requests: Array<Request> = [];
    let body: unknown;
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        body = JSON.parse((init?.body as string) ?? "{}");
        return Response.json({
          token: "Ab3Cd4Ef5Gh6J",
          expiresAt: "2026-06-18T12:15:00Z",
        });
      },
    });

    const result = await client.onboard.createHandoff("wallet-a:og1.claims.sig");

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/onboard/handoff");
    expect(body).toEqual({ grant: "wallet-a:og1.claims.sig" });
    expect(result.token).toBe("Ab3Cd4Ef5Gh6J");
    expect(result.expiresAt).toBe("2026-06-18T12:15:00Z");
  });

  it("redeemHandoff POSTs the token to /onboard/handoff/redeem and returns the grant", async () => {
    const requests: Array<Request> = [];
    let body: unknown;
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        body = JSON.parse((init?.body as string) ?? "{}");
        return Response.json({
          grant: "wallet-a:og1.claims.sig",
          wallet: "wallet-a",
          scope: ["user.profile"],
          expiresAt: "2026-06-18T12:15:00Z",
        });
      },
    });

    const result = await client.onboard.redeemHandoff("Ab3Cd4Ef5Gh6J");

    expect(new URL(requests[0]!.url).pathname).toBe("/onboard/handoff/redeem");
    expect(body).toEqual({ token: "Ab3Cd4Ef5Gh6J" });
    expect(result.grant).toBe("wallet-a:og1.claims.sig");
    expect(result.wallet).toBe("wallet-a");
    expect(result.scope).toEqual(["user.profile"]);
  });
});
