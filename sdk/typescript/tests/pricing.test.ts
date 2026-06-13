import { describe, expect, it } from "vitest";
import { TinyVerseClient } from "../src/index.js";

describe("PricingApi", () => {
  it("executes swaps with destination alias and structured payment payloads", async () => {
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
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
    const client = new TinyVerseClient({
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
});
