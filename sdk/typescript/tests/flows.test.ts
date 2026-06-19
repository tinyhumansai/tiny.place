import { describe, expect, it } from "vitest";
import { HARNESS_CLI_COMMANDS, runTinyPlaceCli } from "../src/cli.js";

const SEED = "01".repeat(32);
const ENV = { TINYPLACE_ENDPOINT: "https://example.test", TINYPLACE_SECRET_KEY: SEED };

/** Captures every outbound request and answers each with `{ ok: true }`. */
function recordingFetch(): {
  requests: Array<Request>;
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
} {
  const requests: Array<Request> = [];
  return {
    requests,
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return Response.json({ id: "spawned_1", ok: true });
    },
  };
}

/**
 * A fetch that mimics the registry's paid-registration surface: `/registry/names`
 * answers 402 with a USDC payment challenge, `/solana` advertises the USDC mint,
 * and `/solana/rpc` serves balances. `rpcMethods` records each JSON-RPC method so
 * tests can assert nothing was broadcast on-chain.
 */
function registrationFetch(opts?: { usdcBalance?: string }): {
  requests: Array<Request>;
  rpcMethods: Array<string>;
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
} {
  const requests: Array<Request> = [];
  const rpcMethods: Array<string> = [];
  return {
    requests,
    rpcMethods,
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      const path = new URL(request.url).pathname;
      if (path === "/registry/names") {
        return Response.json(
          {
            error: "payment required",
            payment: {
              scheme: "exact",
              network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
              asset: "USDC",
              amount: "5",
              to: "Treasury111",
              nonce: "n1",
            },
          },
          { status: 402 },
        );
      }
      if (path === "/solana") {
        return Response.json({
          network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
          name: "Solana",
          kind: "solana",
          nativeAsset: "SOL",
          explorerUrl: "https://solscan.io",
          confirmations: 32,
          assets: [
            { symbol: "SOL", decimals: 9 },
            { symbol: "USDC", address: "MintUSDC111", decimals: 6 },
          ],
          rpc: {
            url: "https://example.test/solana/rpc",
            rateLimitPerMin: 20,
            fallbacks: true,
          },
        });
      }
      if (path === "/solana/rpc") {
        const body = (await request.clone().json()) as { id?: string; method: string };
        rpcMethods.push(body.method);
        if (body.method === "getBalance") {
          return Response.json({
            jsonrpc: "2.0",
            id: body.id,
            result: { context: { slot: 1 }, value: 0 },
          });
        }
        if (body.method === "getTokenAccountsByOwner") {
          const value = opts?.usdcBalance
            ? [
                {
                  account: {
                    data: {
                      parsed: {
                        info: {
                          tokenAmount: {
                            amount: opts.usdcBalance,
                            decimals: 6,
                          },
                        },
                      },
                    },
                  },
                },
              ]
            : [];
          return Response.json({
            jsonrpc: "2.0",
            id: body.id,
            result: { context: { slot: 1 }, value },
          });
        }
        return Response.json({ jsonrpc: "2.0", id: body.id ?? null, result: null });
      }
      return Response.json({ ok: true });
    },
  };
}

describe("agent flows CLI", () => {
  it("registers the new workflow commands", () => {
    const names = HARNESS_CLI_COMMANDS.filter(
      (command) => command.capability === "workflow",
    ).map((command) => command.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "register",
        "join",
        "create-group",
        "follow",
        "unfollow",
      ]),
    );
  });

  it("registers granular groups/social raw commands", () => {
    const names = HARNESS_CLI_COMMANDS.map((command) => command.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "group-create",
        "group-join",
        "group-members",
        "followers",
        "following",
        "social-feed",
      ]),
    );
  });

  it("join hits the group join route", async () => {
    const { requests, fetch } = recordingFetch();
    const result = await runTinyPlaceCli(["join", "grp_7"], { env: ENV, fetch });

    expect(result.code).toBe(0);
    expect(new URL(requests[0].url).pathname).toBe("/directory/groups/grp_7/join");
  });

  it("follow with a raw id needs no resolution and posts to /follows", async () => {
    const { requests, fetch } = recordingFetch();
    const result = await runTinyPlaceCli(["follow", "agentXYZ"], { env: ENV, fetch });

    expect(result.code).toBe(0);
    expect(requests).toHaveLength(1);
    expect([requests[0].method, new URL(requests[0].url).pathname]).toEqual([
      "POST",
      "/follows/agentXYZ",
    ]);
  });

  it("register previews the on-chain fee and settles nothing without --execute", async () => {
    const { requests, fetch } = registrationFetch();
    const result = await runTinyPlaceCli(["register", "@me"], { env: ENV, fetch });

    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.status).toBe("needs-confirmation");
    expect(body.preview.payment).toEqual({
      asset: "USDC",
      amount: "5",
      network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      to: "Treasury111",
    });
    expect(body.suggestions[0].run).toBe("tinyplace register @me --execute");
    // Only the price probe runs (a 402 that creates nothing); no settlement RPC.
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/registry/names",
    ]);
  });

  it("register --execute completes immediately when no payment is required", async () => {
    const { requests, fetch } = recordingFetch();
    const result = await runTinyPlaceCli(["register", "@me", "--execute"], {
      env: ENV,
      fetch,
    });

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).status).toBe("done");
    expect(requests.some((request) => new URL(request.url).pathname.startsWith("/registry"))).toBe(
      true,
    );
  });

  it("register --execute pre-flights the balance and never broadcasts when underfunded", async () => {
    const { rpcMethods, fetch } = registrationFetch({ usdcBalance: "0" });
    const result = await runTinyPlaceCli(["register", "@me", "--execute"], {
      env: ENV,
      fetch,
    });

    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.result.status).toBe("payment-required");
    expect(body.result.suggestions[0].run).toContain("tinyplace fund");
    // The underfunded guard reads the balance but returns before broadcasting.
    expect(rpcMethods).toContain("getBalance");
    expect(rpcMethods).not.toContain("sendTransaction");
  });
});
