import { describe, expect, it } from "vitest";
import { LocalSigner, TinyPlaceClient } from "../src/index.js";

describe("PricingApi", () => {
  it("builds swap and bridge quote query strings", async () => {
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({});
      },
    });

    await client.pricing.swapQuote({
      from: "SOL",
      to: "USDC",
      amount: "1000000000",
      network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    });
    await client.pricing.bridgeRoutes({
      from: "eip155:8453",
      to: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      asset: "USDC",
    });
    await client.pricing.bridgeQuote({
      from: "eip155:8453",
      to: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      asset: "USDC",
      amount: "10000000",
    });

    expect(requests.map((request) => request.url)).toEqual([
      "https://example.test/swap/quote?from=SOL&to=USDC&amount=1000000000&network=solana%3A5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      "https://example.test/bridge/routes?from=eip155%3A8453&to=solana%3A5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp&asset=USDC",
      "https://example.test/bridge/quote?from=eip155%3A8453&to=solana%3A5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp&asset=USDC&amount=10000000",
    ]);
  });

  it("executes swaps with destination alias and structured payment payloads", async () => {
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          swapId: "swap_123",
          quoteId: "quote_123",
          status: "completed",
          from: { asset: "SOL", amount: "1" },
          to: { asset: "USDC", amount: "100" },
          destinationAddress: "solana-destination",
          createdAt: "2026-06-13T00:00:00.000Z",
        });
      },
    });

    const response = await client.pricing.executeSwap({
      quoteId: "quote_123",
      destination: "solana-destination",
      payment: {
        scheme: "exact",
        network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        asset: "USDC",
        amount: "100",
        from: "payer",
        to: "tinyplace-swap",
        signature: "signed",
      },
    });

    expect(response.destinationAddress).toBe("solana-destination");
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.method).toBe("POST");
    expect(request.url).toBe("https://example.test/swap/execute");
    await expect(request.json()).resolves.toEqual({
      quoteId: "quote_123",
      destination: "solana-destination",
      payment: {
        scheme: "exact",
        network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        asset: "USDC",
        amount: "100",
        from: "payer",
        to: "tinyplace-swap",
        signature: "signed",
      },
    });
  });

  it("executes bridges with structured payment payloads", async () => {
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          bridgeId: "bridge_123",
          quoteId: "quote_123",
          status: "completed",
          from: { asset: "USDC", amount: "100", network: "eip155:8453" },
          to: {
            asset: "USDC",
            amount: "99",
            network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
          },
          provider: "wormhole",
          destinationAddress: "solana-destination",
          createdAt: "2026-06-13T00:00:00.000Z",
        });
      },
    });

    await client.pricing.executeBridge({
      quoteId: "quote_123",
      destinationAddress: "solana-destination",
      payment: {
        scheme: "exact",
        network: "eip155:8453",
        asset: "USDC",
        amount: "100",
        from: "payer",
        to: "tinyplace-bridge",
        signature: "signed",
      },
    });

    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.method).toBe("POST");
    expect(request.url).toBe("https://example.test/bridge/execute");
    await expect(request.json()).resolves.toEqual({
      quoteId: "quote_123",
      destinationAddress: "solana-destination",
      payment: {
        scheme: "exact",
        network: "eip155:8453",
        asset: "USDC",
        amount: "100",
        from: "payer",
        to: "tinyplace-bridge",
        signature: "signed",
      },
    });
  });

  it("signs swap and bridge execution as the requested payer", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(63));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.includes("/swap/execute")) {
          return Response.json({
            swapId: "swap_123",
            quoteId: "quote_123",
            status: "completed",
            from: { asset: "SOL", amount: "1" },
            to: { asset: "USDC", amount: "100" },
            createdAt: "2026-06-13T00:00:00.000Z",
          });
        }
        return Response.json({
          bridgeId: "bridge_123",
          quoteId: "quote_456",
          status: "completed",
          from: { asset: "USDC", amount: "100", network: "eip155:8453" },
          to: {
            asset: "USDC",
            amount: "99",
            network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
          },
          provider: "wormhole",
          createdAt: "2026-06-13T00:00:00.000Z",
        });
      },
    });

    await client.pricing.executeSwap({ quoteId: "quote_123" }, signer.agentId);
    await client.pricing.executeBridge({ quoteId: "quote_456" }, signer.agentId);

    expect(requests.map((request) => request.url)).toEqual([
      "https://example.test/swap/execute",
      "https://example.test/bridge/execute",
    ]);

    for (const request of requests) {
      expect(request.method).toBe("POST");
      expect(request.headers.get("X-Agent-ID")).toBe(signer.agentId);
      expect(request.headers.get("X-TinyPlace-Public-Key")).toBe(
        signer.publicKeyBase64,
      );
      expect(request.headers.get("X-TinyPlace-Signature")).toBeTruthy();
      expect(request.headers.get("Authorization")).toBeNull();
    }
  });

  it("signs swap and bridge reads as the requested agent", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(62));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.includes("/swap/history")) {
          return Response.json({ swaps: [] });
        }
        if (request.url.includes("/bridge/history")) {
          return Response.json({ bridges: [] });
        }
        if (request.url.includes("/swap/")) {
          return Response.json({
            swapId: "swap_123",
            status: "completed",
            createdAt: "2026-06-13T00:00:00.000Z",
          });
        }
        return Response.json({
          bridgeId: "bridge_123",
          status: "completed",
          createdAt: "2026-06-13T00:00:00.000Z",
        });
      },
    });

    await client.pricing.getSwap("swap_123", signer.agentId);
    await client.pricing.getSwapStatus("swap_123", signer.agentId);
    await client.pricing.swapHistory({ limit: 2 }, signer.agentId);
    await client.pricing.getBridge("bridge_123", signer.agentId);
    await client.pricing.getBridgeStatus("bridge_123", signer.agentId);
    await client.pricing.bridgeHistory({ limit: 2 }, signer.agentId);

    expect(requests.map((request) => request.url)).toEqual([
      "https://example.test/swap/swap_123",
      "https://example.test/swap/status/swap_123",
      "https://example.test/swap/history?limit=2",
      "https://example.test/bridge/bridge_123",
      "https://example.test/bridge/status/bridge_123",
      "https://example.test/bridge/history?limit=2",
    ]);

    for (const request of requests) {
      expect(request.headers.get("X-Agent-ID")).toBe(signer.agentId);
      expect(request.headers.get("X-TinyPlace-Public-Key")).toBe(
        signer.publicKeyBase64,
      );
      expect(request.headers.get("X-TinyPlace-Signature")).toBeTruthy();
      expect(request.headers.get("Authorization")).toBeNull();
    }
  });
});
