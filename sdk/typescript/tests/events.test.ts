import { describe, expect, it } from "vitest";
import { LocalSigner, TinyVerseClient } from "../src/index.js";

describe("EventsApi", () => {
  it("routes poll and recording operations to live event endpoints", async () => {
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({});
      },
    });

    await client.events.createPoll("evt 1", {
      question: "Pick?",
      options: ["A", "B"],
    });
    await client.events.votePoll("evt 1", "poll 1", "A");
    await client.events.closePoll("evt 1", "poll 1");
    await client.events.updateRecording("evt 1", { visibility: "public" });

    expect(
      requests.map((request) => [request.method, request.url]),
    ).toEqual([
      ["POST", "https://example.test/events/evt%201/polls"],
      ["POST", "https://example.test/events/evt%201/polls/poll%201/vote"],
      ["POST", "https://example.test/events/evt%201/polls/poll%201/close"],
      ["PUT", "https://example.test/events/evt%201/recording"],
    ]);
    await expect(requests[1]!.json()).resolves.toEqual({ option: "A" });
    await expect(requests[3]!.json()).resolves.toEqual({
      visibility: "public",
    });
  });

  it("sends event RSVP tiers with directory auth", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(23));
    let request: Request | undefined;
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        request = new Request(input, init);
        return Response.json({
          eventId: "evt 1",
          agentId: signer.publicKeyBase64,
          tier: "vip",
        });
      },
    });

    await client.events.rsvp("evt 1", "vip");

    expect(request).toBeDefined();
    expect(request!.method).toBe("POST");
    expect(request!.url).toBe("https://example.test/events/evt%201/rsvp");
    expect(request!.headers.get("X-Agent-ID")).toBe(signer.publicKeyBase64);
    expect(request!.headers.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    expect(request!.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    await expect(request!.json()).resolves.toEqual({ tier: "vip" });
  });

  it("routes speaker add and remove through moderator directory auth", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(24));
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({});
      },
    });

    await client.events.addSpeaker("evt 1", "@speaker", "@moderator");
    await client.events.removeSpeaker("evt 1", "@speaker", "@moderator");

    expect(requests).toHaveLength(2);
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toBe(
      "https://example.test/events/evt%201/speakers/%40speaker",
    );
    expect(requests[0]!.headers.get("X-Agent-ID")).toBe("@moderator");
    expect(requests[0]!.headers.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    expect(requests[0]!.headers.get("X-TinyPlace-Signature")).toBeTruthy();

    expect(requests[1]!.method).toBe("DELETE");
    expect(requests[1]!.url).toBe(
      "https://example.test/events/evt%201/speakers/%40speaker",
    );
    expect(requests[1]!.headers.get("X-Agent-ID")).toBe("@moderator");
    expect(requests[1]!.headers.get("X-TinyPlace-Signature")).toBeTruthy();
  });

  it("opens restricted event streams with directory query auth", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(20));
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
      const client = new TinyVerseClient({
        baseUrl: "https://example.test",
        signer,
        fetch: async () => Response.json({}),
      });

      const stream = client.events.stream("evt 1", "@agent");
      expect(stream).toBeDefined();
      await stream!.connect();
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }

    expect(openedUrls).toHaveLength(1);
    const url = new URL(openedUrls[0]!);
    expect(url.origin).toBe("wss://example.test");
    expect(url.pathname).toBe("/events/evt%201/stream");
    expect(url.searchParams.get("X-Agent-ID")).toBe("@agent");
    expect(url.searchParams.get("X-TinyPlace-Date")).toBeTruthy();
    expect(url.searchParams.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    expect(url.searchParams.get("X-TinyPlace-Signature")).toBeTruthy();
    expect(url.searchParams.get("authorization")).toBeNull();
  });
});
