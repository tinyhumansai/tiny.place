import { describe, expect, it } from "vitest";
import { TinyPlaceClient } from "../src/index.js";

describe("PricingApi", () => {
  it("builds pricing query strings", async () => {
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({});
      },
    });

    await client.pricing.quote({
      base: "SOL",
      quote: "USDC",
      network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    });
    await client.pricing.history({
      base: "SOL",
      quote: "USDC",
      interval: "1h",
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-06-02T00:00:00.000Z",
    });
    await client.pricing.gas("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");

    expect(requests.map((request) => request.url)).toEqual([
      "https://example.test/pricing/quote?base=SOL&quote=USDC&network=solana%3A5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      "https://example.test/pricing/history?base=SOL&quote=USDC&interval=1h&from=2026-06-01T00%3A00%3A00.000Z&to=2026-06-02T00%3A00%3A00.000Z",
      "https://example.test/pricing/gas?network=solana%3A5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    ]);
  });

  it("calls pricing metadata endpoints", async () => {
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({});
      },
    });

    await client.pricing.assets();
    await client.pricing.pairs();
    await client.pricing.networks();

    expect(requests.map((request) => request.url)).toEqual([
      "https://example.test/pricing/assets",
      "https://example.test/pricing/pairs",
      "https://example.test/pricing/networks",
    ]);
  });
});
