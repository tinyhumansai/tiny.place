import { describe, expect, it } from "vitest";
import { LocalSigner, TinyPlaceClient } from "../src/index.js";

describe("EscrowApi", () => {
  it("signs escrow create and action requests for the handle actor", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(24));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          escrowId: "esc_123",
          status: "funded",
          client: "@buyer",
          provider: "@seller",
          amount: "100",
          asset: "USDC",
          network: "eip155:8453",
          terms: {
            description: "Deliver report",
            deadline: "2026-06-14T00:00:00Z",
            maxRevisions: 1,
          },
          revisionCount: 0,
          createdAt: "2026-06-13T00:00:00Z",
          fundedAt: "2026-06-13T00:00:00Z",
        });
      },
    });

    await client.escrow.create({
      client: "@buyer",
      provider: "@seller",
      amount: "100",
      asset: "USDC",
      network: "eip155:8453",
      terms: {
        description: "Deliver report",
        deadline: "2026-06-14T00:00:00Z",
        maxRevisions: 1,
      },
      paymentAuthorization: "signed-payment",
    });
    await client.escrow.accept("esc_123", "@seller");

    expect(requests).toHaveLength(2);
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toBe("https://example.test/escrow");
    expect(requests[0]!.headers.get("X-Agent-ID")).toBe("@buyer");
    expect(requests[0]!.headers.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    expect(requests[0]!.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    await expect(requests[0]!.json()).resolves.toMatchObject({
      client: "@buyer",
      provider: "@seller",
      paymentAuthorization: "signed-payment",
    });

    expect(requests[1]!.method).toBe("POST");
    expect(requests[1]!.url).toBe("https://example.test/escrow/esc_123/accept");
    expect(requests[1]!.headers.get("X-Agent-ID")).toBe("@seller");
    expect(requests[1]!.headers.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    expect(requests[1]!.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    await expect(requests[1]!.json()).resolves.toEqual({ actor: "@seller" });
  });

  it("opens restricted escrow streams with directory query auth", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(21));
    const openedUrls: Array<string> = [];
    const originalWebSocket = globalThis.WebSocket;

    class MockWebSocket {
      static readonly OPEN = 1;
      readyState = MockWebSocket.OPEN;
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: ((error: unknown) => void) | null = null;

      constructor(url: string) {
        openedUrls.push(url);
        queueMicrotask(() => {
          this.onopen?.();
        });
      }

      send(): void {}

      close(): void {
        this.onclose?.();
      }
    }

    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    try {
      const client = new TinyPlaceClient({
        baseUrl: "https://example.test",
        signer,
        fetch: async () => Response.json({}),
      });

      const stream = client.escrow.stream("esc 1", "@buyer");
      expect(stream).toBeDefined();
      await stream!.connect();
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }

    expect(openedUrls).toHaveLength(1);
    const url = new URL(openedUrls[0]!);
    expect(url.origin).toBe("wss://example.test");
    expect(url.pathname).toBe("/escrow/esc%201/stream");
    expect(url.searchParams.get("X-Agent-ID")).toBe("@buyer");
    expect(url.searchParams.get("X-TinyPlace-Date")).toBeTruthy();
    expect(url.searchParams.get("X-TinyPlace-Nonce")).toBeTruthy();
    expect(url.searchParams.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    expect(url.searchParams.get("X-TinyPlace-Signature")).toBeTruthy();
    expect(url.searchParams.get("authorization")).toBeNull();
  });
});
