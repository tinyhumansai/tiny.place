import { describe, expect, it } from "vitest";
import { LocalSigner, TinyPlaceClient } from "../src/index.js";

async function captureStreamUrl(
  openStream: (client: TinyPlaceClient) => Promise<void>,
): Promise<{ signerPublicKey: string; url: URL }> {
  const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(22));
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
    await openStream(client);
  } finally {
    globalThis.WebSocket = originalWebSocket;
  }

  expect(openedUrls).toHaveLength(1);
  return {
    signerPublicKey: signer.publicKeyBase64,
    url: new URL(openedUrls[0]!),
  };
}

describe("social streams", () => {
  it("opens restricted channel streams with directory query auth", async () => {
    const { signerPublicKey, url } = await captureStreamUrl(async (client) => {
      const stream = client.channels.stream("chan 1", {
        agentId: "@viewer",
        limit: 25,
      });
      expect(stream).toBeDefined();
      await stream!.connect();
    });

    expect(url.origin).toBe("wss://example.test");
    expect(url.pathname).toBe("/channels/chan%201/stream");
    expect(url.searchParams.get("X-Agent-ID")).toBe("@viewer");
    expect(url.searchParams.get("limit")).toBe("25");
    expect(url.searchParams.get("X-TinyPlace-Nonce")).toBeTruthy();
    expect(url.searchParams.get("X-TinyPlace-Public-Key")).toBe(
      signerPublicKey,
    );
    expect(url.searchParams.get("X-TinyPlace-Signature")).toBeTruthy();
    expect(url.searchParams.get("authorization")).toBeNull();
  });

  it("opens restricted conversation streams with directory query auth", async () => {
    const { signerPublicKey, url } = await captureStreamUrl(async (client) => {
      const stream = client.conversations.stream("conv 1", {
        agentId: "@member",
        limit: 10,
      });
      expect(stream).toBeDefined();
      await stream!.connect();
    });

    expect(url.pathname).toBe("/conversations/conv%201/stream");
    expect(url.searchParams.get("X-Agent-ID")).toBe("@member");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("X-TinyPlace-Nonce")).toBeTruthy();
    expect(url.searchParams.get("X-TinyPlace-Public-Key")).toBe(
      signerPublicKey,
    );
    expect(url.searchParams.get("X-TinyPlace-Signature")).toBeTruthy();
    expect(url.searchParams.get("authorization")).toBeNull();
  });

  it("opens restricted broadcast streams with directory query auth", async () => {
    const { signerPublicKey, url } = await captureStreamUrl(async (client) => {
      const stream = client.broadcasts.stream("bcast 1", {
        agentId: "@subscriber",
        limit: 5,
        paymentAuthorization: "x402-stream-token",
      });
      expect(stream).toBeDefined();
      await stream!.connect();
    });

    expect(url.pathname).toBe("/broadcasts/bcast%201/stream");
    expect(url.searchParams.get("X-Agent-ID")).toBe("@subscriber");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("paymentAuthorization")).toBe(
      "x402-stream-token",
    );
    expect(url.searchParams.get("X-TinyPlace-Nonce")).toBeTruthy();
    expect(url.searchParams.get("X-TinyPlace-Public-Key")).toBe(
      signerPublicKey,
    );
    expect(url.searchParams.get("X-TinyPlace-Signature")).toBeTruthy();
    expect(url.searchParams.get("authorization")).toBeNull();
  });
});
