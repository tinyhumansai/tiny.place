import { describe, expect, it } from "vitest";
import { LocalSigner, TinyPlaceClient } from "../src/index.js";

describe("BridgeApi", () => {
  it("exposes the live bridge route group directly", async () => {
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.includes("/bridge/routes")) {
          return Response.json({ routes: [] });
        }
        if (request.url.includes("/bridge/quote")) {
          return Response.json({
            quoteId: "bquote_123",
            from: { asset: "USDC", amount: "100", network: "eip155:8453" },
            to: {
              asset: "USDC",
              amount: "99",
              network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
            },
            provider: "wormhole",
            fee: { amount: "1", asset: "USDC" },
            estimatedTime: "120s",
            expiresAt: "2026-06-13T00:00:00Z",
          });
        }
        return Response.json({
          bridgeId: "bridge_123",
          quoteId: "bquote_123",
          status: "completed",
          from: { asset: "USDC", amount: "100", network: "eip155:8453" },
          to: {
            asset: "USDC",
            amount: "99",
            network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
          },
          provider: "wormhole",
          destinationAddress: "solana-destination",
          createdAt: "2026-06-13T00:00:00Z",
        });
      },
    });

    await client.bridge.routes({
      from: "eip155:8453",
      to: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      asset: "USDC",
    });
    await client.bridge.quote({
      from: "eip155:8453",
      to: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      asset: "USDC",
      amount: "100",
    });
    await client.bridge.execute({
      quoteId: "bquote_123",
      destinationAddress: "solana-destination",
      paymentAuthorization: "signed",
    });
    await client.bridge.get("bridge 123");
    await client.bridge.status("bridge 123");
    await client.bridge.history({ limit: 5 });

    expect(requests.map((request) => request.url)).toEqual([
      "https://example.test/bridge/routes?from=eip155%3A8453&to=solana%3A5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp&asset=USDC",
      "https://example.test/bridge/quote?from=eip155%3A8453&to=solana%3A5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp&asset=USDC&amount=100",
      "https://example.test/bridge/execute",
      "https://example.test/bridge/bridge%20123",
      "https://example.test/bridge/status/bridge%20123",
      "https://example.test/bridge/history?limit=5",
    ]);
    await expect(requests[2]!.json()).resolves.toEqual({
      quoteId: "bquote_123",
      destinationAddress: "solana-destination",
      paymentAuthorization: "signed",
    });
  });

  it("signs bridge execution and reads as the requested agent", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(67));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          bridgeId: "bridge_123",
          quoteId: "bquote_123",
          status: "completed",
          from: { asset: "USDC", amount: "100", network: "eip155:8453" },
          to: {
            asset: "USDC",
            amount: "99",
            network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
          },
          provider: "wormhole",
          destinationAddress: "solana-destination",
          createdAt: "2026-06-13T00:00:00Z",
        });
      },
    });

    await client.bridge.execute({ quoteId: "bquote_123" }, signer.agentId);
    await client.bridge.history(undefined, signer.agentId);

    for (const request of requests) {
      expect(request.headers.get("X-Agent-ID")).toBe(signer.agentId);
      expect(request.headers.get("X-TinyPlace-Public-Key")).toBe(
        signer.publicKeyBase64,
      );
      expect(request.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    }
  });
});
