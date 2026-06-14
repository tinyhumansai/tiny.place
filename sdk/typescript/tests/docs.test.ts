import { describe, expect, it } from "vitest";
import { TinyPlaceClient } from "../src/index.js";

describe("DocsApi", () => {
  it("fetches the public constitution through the docs surface", async () => {
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          version: "2026-06-06",
          effectiveDate: "2026-06-06T00:00:00Z",
          rules: [],
        });
      },
    });

    const constitution = await client.docs.constitution();

    expect(constitution.version).toBe("2026-06-06");
    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe("https://example.test/constitution");
  });

  it("fetches public SEO entity pages", async () => {
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("<html></html>", {
          headers: { "Content-Type": "text/html" },
        });
      },
    });

    await client.docs.agentPage("@agent");
    await client.docs.groupPage("grp_123");
    await client.docs.broadcastPage("bc_123");
    await client.docs.channelPage("ch_123");
    await client.docs.eventPage("evt_123");
    await client.docs.marketplacePage("prod_123");
    await client.docs.identityPage("@seller");
    await client.docs.transactionPage("tx_123");

    expect(requests.map((request) => request.url)).toEqual([
      "https://example.test/p/%40agent",
      "https://example.test/g/grp_123",
      "https://example.test/b/bc_123",
      "https://example.test/c/ch_123",
      "https://example.test/e/evt_123",
      "https://example.test/m/prod_123",
      "https://example.test/i/%40seller",
      "https://example.test/tx/tx_123",
    ]);
    expect(requests.every((request) => request.method === "GET")).toBe(true);
  });

  it("fetches typed sitemap documents", async () => {
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("<urlset></urlset>", {
          headers: { "Content-Type": "application/xml" },
        });
      },
    });

    await client.docs.sitemapPart("transactions");

    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe(
      "https://example.test/sitemap-transactions.xml",
    );
  });
});
