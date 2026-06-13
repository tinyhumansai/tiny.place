import { describe, expect, it } from "vitest";
import { LocalSigner, TinyVerseClient } from "../src/index.js";

describe("RoomsApi", () => {
  it("records emergency withdrawals with directory write auth", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(21));
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          room: {
            roomId: "room_123",
            game: "poker",
            variant: "holdem",
            name: "Room",
            stakes: {
              smallBlind: "1",
              bigBlind: "2",
              asset: "USDC",
              network: "eip155:8453",
            },
            buyIn: { min: "10", max: "100" },
            escrow: { contract: "0xescrow", network: "eip155:8453" },
            seats: 2,
            players: [],
            observerCount: 0,
            speed: "normal",
            timeouts: { decision: 30, disconnectGrace: 120 },
            rake: { rate: "0.01", cap: "1" },
            handNumber: 0,
            status: "waiting",
            createdAt: "2026-06-13T00:00:00Z",
            updatedAt: "2026-06-13T00:00:00Z",
          },
          seat: {
            seat: 1,
            handle: "@player",
            stack: "10",
            status: "active",
          },
          withdrawal: {
            requestedAt: "2026-06-13T00:00:00Z",
            executableAt: "2026-06-14T00:00:00Z",
            requestTxHash: "0xwithdraw",
            status: "requested",
          },
        });
      },
    });

    const response = await client.rooms.emergencyWithdrawal("room_123", {
      operator: "@operator",
      agentId: "@player",
      requestTxHash: "0xwithdraw",
    });

    expect(response.withdrawal.status).toBe("requested");
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.method).toBe("POST");
    expect(request.url).toBe(
      "https://example.test/rooms/room_123/emergency-withdrawals",
    );
    expect(request.headers.get("X-Agent-ID")).toBe(signer.publicKeyBase64);
    expect(request.headers.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    expect(request.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    await expect(request.json()).resolves.toEqual({
      operator: "@operator",
      agentId: "@player",
      requestTxHash: "0xwithdraw",
    });
  });
});
