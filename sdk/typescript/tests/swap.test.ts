import { describe, expect, it } from "vitest";
import { LocalSigner, TinyPlaceClient } from "../src/index.js";

describe("SwapApi", () => {
  it("exposes the live swap route group directly", async () => {
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.includes("/swap/quote")) {
          return Response.json({
            quoteId: "quote_123",
            from: { asset: "SOL", amount: "1000000000" },
            to: { asset: "USDC", amount: "1000000" },
            rate: "100",
            priceImpact: "0",
            fee: { amount: "1", asset: "USDC" },
            route: ["test"],
            expiresAt: "2026-06-13T00:00:00Z",
            slippageTolerance: "0.5",
          });
        }
        return Response.json({
          swapId: "swap_123",
          quoteId: "quote_123",
          status: "completed",
          from: { asset: "SOL", amount: "1000000000" },
          to: { asset: "USDC", amount: "1000000" },
          createdAt: "2026-06-13T00:00:00Z",
        });
      },
    });

    await client.swap.quote({
      from: "SOL",
      to: "USDC",
      amount: "1000000000",
      network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      slippageTolerance: "0.5",
    });
    await client.swap.execute({
      quoteId: "quote_123",
      destination: "solana-destination",
      paymentAuthorization: "signed",
    });
    await client.swap.get("swap 123");
    await client.swap.status("swap 123");
    await client.swap.history({ limit: 5 });

    expect(requests.map((request) => request.url)).toEqual([
      "https://example.test/swap/quote?from=SOL&to=USDC&amount=1000000000&network=solana%3A5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp&slippageTolerance=0.5",
      "https://example.test/swap/execute",
      "https://example.test/swap/swap%20123",
      "https://example.test/swap/status/swap%20123",
      "https://example.test/swap/history?limit=5",
    ]);
    await expect(requests[1]!.json()).resolves.toEqual({
      quoteId: "quote_123",
      destination: "solana-destination",
      paymentAuthorization: "signed",
    });
  });

  it("signs swap execution and reads as the requested agent", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(66));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          swapId: "swap_123",
          quoteId: "quote_123",
          status: "completed",
          from: { asset: "SOL", amount: "1" },
          to: { asset: "USDC", amount: "100" },
          createdAt: "2026-06-13T00:00:00Z",
        });
      },
    });

    await client.swap.execute({ quoteId: "quote_123" }, signer.agentId);
    await client.swap.history(undefined, signer.agentId);

    for (const request of requests) {
      expect(request.headers.get("X-Agent-ID")).toBe(signer.agentId);
      expect(request.headers.get("X-TinyPlace-Public-Key")).toBe(
        signer.publicKeyBase64,
      );
      expect(request.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    }
  });
});
