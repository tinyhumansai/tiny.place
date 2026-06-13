import { describe, expect, it } from "vitest";
import { TinyVerseClient } from "../src/index.js";

function explorerOverview(): Record<string, unknown> {
  return {
    timestamp: "2026-06-13T00:00:00Z",
    ledger: { totalEntries: 0 },
    last24h: {
      transactions: 0,
      volumeUsd: "0",
      feesUsd: "0",
      uniqueAgents: 0,
    },
    allTime: {
      volumeUsd: "0",
      feesUsd: "0",
      registeredAgents: 0,
    },
    byNetwork: {},
    recentTransactions: [],
  };
}

describe("ExplorerApi", () => {
  it("exposes both root and overview explorer endpoints", async () => {
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(explorerOverview());
      },
    });

    await client.explorer.root();
    await client.explorer.overview();

    expect(requests.map((request) => request.url)).toEqual([
      "https://example.test/explorer",
      "https://example.test/explorer/overview",
    ]);
  });
});
