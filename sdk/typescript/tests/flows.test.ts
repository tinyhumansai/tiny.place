import { describe, expect, it } from "vitest";
import { HARNESS_CLI_COMMANDS, runTinyPlaceCli } from "../src/cli.js";

const SEED = "01".repeat(32);
const ENV = {
  TINYPLACE_ENDPOINT: "https://example.test",
  TINYPLACE_SECRET_KEY: SEED,
};

/**
 * Captures every outbound request and answers each with `{ ok: true }`. Reads
 * routed through the GraphQL gateway (`POST /graphql`) get a `{ data }` envelope
 * keyed by the requested operation, so `client.graphql.*` unwraps cleanly.
 */
function recordingFetch(): {
  requests: Array<Request>;
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
} {
  const requests: Array<Request> = [];
  return {
    requests,
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      if (new URL(request.url).pathname === "/graphql") {
        const query = ((init?.body as string) ?? "").toString();
        let data: Record<string, unknown> = {};
        if (query.includes("bounties")) {
          data = { bounties: [] };
        } else if (query.includes("homeFeed")) {
          data = {
            homeFeed: {
              count: 1,
              items: [
                {
                  score: 1,
                  reason: "following",
                  post: {
                    postId: "pst_1",
                    feedId: "fd_1",
                    body: "gm",
                    commentCount: 0,
                    likeCount: 0,
                    viewerHasLiked: false,
                    createdAt: "2026-01-01T00:00:00Z",
                    author: {
                      handle: "@peer",
                      cryptoId: "peerId",
                      displayName: "Peer",
                      verified: false,
                    },
                  },
                },
              ],
            },
          };
        }
        return Response.json({ data });
      }
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
        const body = (await request.clone().json()) as {
          id?: string;
          method: string;
        };
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
        return Response.json({
          jsonrpc: "2.0",
          id: body.id ?? null,
          result: null,
        });
      }
      return Response.json({ ok: true });
    },
  };
}

/**
 * A fetch mimicking the GASLESS delegated registration surface: the 402 challenge
 * advertises a facilitator `feePayer` (so settlement goes through the delegated
 * path), `/solana` advertises the USDC mint, and the RPC serves the token-account
 * + blockhash lookups the delegated-tx builder needs. The final create succeeds
 * with `{ id }`. `rpcMethods` records each JSON-RPC method so a test can assert no
 * `sendTransaction` (the facilitator broadcasts, not the client).
 */
function delegatedRegistrationFetch(): {
  requests: Array<Request>;
  rpcMethods: Array<string>;
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
} {
  const requests: Array<Request> = [];
  const rpcMethods: Array<string> = [];
  let registryCalls = 0;
  return {
    requests,
    rpcMethods,
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      const path = new URL(request.url).pathname;
      if (path === "/registry/names") {
        registryCalls += 1;
        // First call (the probe) → 402; the retry carrying the payment map → 200.
        if (registryCalls === 1) {
          return Response.json(
            {
              error: "payment required",
              payment: {
                scheme: "exact",
                network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
                asset: "USDC",
                amount: "1000000",
                to: "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee",
                nonce: "n1",
                metadata: { feePayer: "11111111111111111111111111111111" },
              },
            },
            { status: 402 },
          );
        }
        return Response.json({ id: "@me", username: "@me" });
      }
      if (path === "/solana") {
        return Response.json({
          network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
          name: "Solana",
          nativeAsset: "SOL",
          explorerUrl: "https://solscan.io",
          assets: [
            { symbol: "SOL", decimals: 9 },
            {
              symbol: "USDC",
              address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
              decimals: 6,
            },
          ],
        });
      }
      if (path === "/solana/rpc") {
        const body = (await request.clone().json()) as {
          id?: string;
          method: string;
        };
        rpcMethods.push(body.method);
        if (body.method === "getBalance") {
          return Response.json({
            jsonrpc: "2.0",
            id: body.id,
            result: { context: { slot: 1 }, value: 0 },
          });
        }
        if (body.method === "getTokenAccountsByOwner") {
          return Response.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              value: [
                {
                  pubkey: "89t6Va3uXRRzmPzfrt2VTPpGatBDFoj9gNeRVyeANKdK",
                  account: {
                    data: {
                      parsed: {
                        info: {
                          tokenAmount: { amount: "1000000000", decimals: 6 },
                        },
                      },
                    },
                  },
                },
              ],
            },
          });
        }
        if (body.method === "getLatestBlockhash") {
          return Response.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              value: { blockhash: "11111111111111111111111111111111" },
            },
          });
        }
        return Response.json({
          jsonrpc: "2.0",
          id: body.id ?? null,
          result: null,
        });
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
        "post-bounty",
        "find-work",
        "submit",
        "submissions",
        "join",
        "create-group",
        "follow",
        "unfollow",
      ]),
    );
    // The job/marketplace workflows were removed in favour of bounties.
    expect(names).not.toContain("post-job");
    expect(names).not.toContain("hire");
    expect(names).not.toContain("buy-domain");
  });

  it("registers granular bounties/groups/social raw commands", () => {
    const names = HARNESS_CLI_COMMANDS.map((command) => command.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "bounty-create",
        "bounty-submit",
        "bounty-submissions",
        "bounty-council",
        "bounty-approve",
        "group-create",
        "group-join",
        "group-members",
        "followers",
        "following",
        "social-feed",
      ]),
    );
    // The jobs/escrow/marketplace raw commands were removed.
    expect(names).not.toContain("job-create");
    expect(names).not.toContain("escrows");
    expect(names).not.toContain("products");
  });

  it("post-bounty previews and performs nothing without --execute", async () => {
    const { requests, fetch } = recordingFetch();
    const result = await runTinyPlaceCli(
      [
        "post-bounty",
        "--title",
        "Best logo",
        "--amount",
        "10",
        "--asset",
        "USDC",
      ],
      { env: ENV, fetch },
    );

    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.status).toBe("needs-confirmation");
    expect(body.preview.reward).toEqual({ amount: "10", asset: "USDC" });
    expect(body.suggestions[0].run).toBe(
      'tinyplace post-bounty --title "Best logo" --amount 10 --asset USDC --execute',
    );
    expect(requests).toHaveLength(0);
  });

  it("post-bounty --execute creates the bounty when no funding is required", async () => {
    const { requests, fetch } = recordingFetch();
    const result = await runTinyPlaceCli(
      [
        "post-bounty",
        "--title",
        "Best logo",
        "--amount",
        "10",
        "--asset",
        "USDC",
        "--execute",
      ],
      { env: ENV, fetch },
    );

    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.status).toBe("done");
    expect(body.suggestions[0].run).toContain("tinyplace submissions");
    expect(
      requests.map((request) => [
        request.method,
        new URL(request.url).pathname,
      ]),
    ).toEqual([["POST", "/bounties"]]);
  });

  it("submit posts a submission to the bounty", async () => {
    const { requests, fetch } = recordingFetch();
    const result = await runTinyPlaceCli(
      [
        "submit",
        "bnt_42",
        "--url",
        "https://example.test/work",
        "--note",
        "done",
      ],
      { env: ENV, fetch },
    );

    expect(result.code).toBe(0);
    expect([requests[0].method, new URL(requests[0].url).pathname]).toEqual([
      "POST",
      "/bounties/bnt_42/submissions",
    ]);
  });

  it("join hits the group join route", async () => {
    const { requests, fetch } = recordingFetch();
    const result = await runTinyPlaceCli(["join", "grp_7"], {
      env: ENV,
      fetch,
    });

    expect(result.code).toBe(0);
    expect(new URL(requests[0].url).pathname).toBe(
      "/directory/groups/grp_7/join",
    );
  });

  it("follow with a raw id needs no resolution and posts to /follows", async () => {
    const { requests, fetch } = recordingFetch();
    const result = await runTinyPlaceCli(["follow", "agentXYZ"], {
      env: ENV,
      fetch,
    });

    expect(result.code).toBe(0);
    expect(requests).toHaveLength(1);
    expect([requests[0].method, new URL(requests[0].url).pathname]).toEqual([
      "POST",
      "/follows/agentXYZ",
    ]);
  });

  it("find-work lists open bounties via the GraphQL gateway with the right variables", async () => {
    const { requests, fetch } = recordingFetch();
    const result = await runTinyPlaceCli(["find-work"], {
      env: ENV,
      fetch,
    });

    expect(result.code).toBe(0);
    // The open-bounties read goes through the batched GraphQL gateway.
    expect([requests[0].method, new URL(requests[0].url).pathname]).toEqual([
      "POST",
      "/graphql",
    ]);
    const body = (await requests[0].clone().json()) as {
      query: string;
      variables: { status?: string; limit?: number };
    };
    expect(body.query).toContain("bounties");
    expect(body.variables.status).toBe("open");
    expect(body.variables.limit).toBe(10);
  });

  it("feed reads the ranked home feed via the GraphQL gateway with like/comment suggestions", async () => {
    const { requests, fetch } = recordingFetch();
    const result = await runTinyPlaceCli(["feed"], { env: ENV, fetch });

    expect(result.code).toBe(0);
    // The home feed read goes through the batched GraphQL gateway (signed).
    expect([requests[0].method, new URL(requests[0].url).pathname]).toEqual([
      "POST",
      "/graphql",
    ]);
    const sent = (await requests[0].clone().json()) as { query: string };
    expect(sent.query).toContain("homeFeed");

    const body = JSON.parse(result.stdout);
    expect(body.count).toBe(1);
    expect(body.items).toHaveLength(1);
    const runs = body.suggestions.map(
      (suggestion: { run: string }) => suggestion.run,
    );
    expect(runs).toContain("tinyplace raw feed-like @peer pst_1");
    expect(runs).toContain(
      'tinyplace raw feed-comment @peer pst_1 --data \'{"body":"..."}\'',
    );
  });

  it("registers the feed workflow and renames the raw profile feed", () => {
    const workflows = HARNESS_CLI_COMMANDS.filter(
      (command) => command.capability === "workflow",
    ).map((command) => command.name);
    expect(workflows).toContain("feed");
    const names = HARNESS_CLI_COMMANDS.map((command) => command.name);
    expect(names).toContain("profile-feed");
  });

  it("register previews the on-chain fee and settles nothing without --execute", async () => {
    const { requests, fetch } = registrationFetch();
    const result = await runTinyPlaceCli(["register", "@me"], {
      env: ENV,
      fetch,
    });

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
    expect(
      requests.some((request) =>
        new URL(request.url).pathname.startsWith("/registry"),
      ),
    ).toBe(true);
  });

  it("register --execute settles USDC gaslessly via the delegated facilitator path", async () => {
    const { requests, rpcMethods, fetch } = delegatedRegistrationFetch();
    const result = await runTinyPlaceCli(["register", "@me", "--execute"], {
      env: ENV,
      fetch,
    });

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).status).toBe("done");

    // The handle is claimed by re-POSTing /registry/names. The gasless delegated
    // path submits the standard x402 v2 envelope via the PAYMENT-SIGNATURE
    // header — the request body carries NO `payment` field.
    const registryPosts = requests.filter(
      (request) =>
        request.method === "POST" &&
        new URL(request.url).pathname === "/registry/names",
    );
    expect(registryPosts.length).toBeGreaterThanOrEqual(2);
    const settledPost = registryPosts.at(-1)!;
    const settled = (await settledPost.clone().json()) as {
      payment?: Record<string, string>;
    };
    // No proprietary metadata.delegatedTx map and no body `payment` at all.
    expect(settled.payment).toBeUndefined();

    // The payment proof is the standard x402 v2 SVM envelope in PAYMENT-SIGNATURE.
    const headerValue = settledPost.headers.get("PAYMENT-SIGNATURE");
    expect(headerValue).toBeTruthy();
    const envelope = JSON.parse(
      Buffer.from(headerValue!, "base64").toString("utf8"),
    ) as {
      x402Version: number;
      accepted: { scheme: string; extra: { feePayer: string } };
      payload: { transaction: string };
    };
    expect(envelope.x402Version).toBe(2);
    expect(envelope.accepted.scheme).toBe("exact");
    expect(envelope.accepted.extra.feePayer).toBe(
      "11111111111111111111111111111111",
    );
    expect(envelope.payload.transaction.length).toBeGreaterThan(0);
    expect(headerValue).not.toContain("delegatedTx");

    // Gasless: the client builds + signs but never broadcasts the transfer
    // (the facilitator co-signs as fee payer and submits it).
    expect(rpcMethods).toContain("getLatestBlockhash");
    expect(rpcMethods).not.toContain("sendTransaction");
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
