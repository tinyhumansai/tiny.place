import { describe, expect, it } from "vitest";
import { LocalSigner, TinyVerseClient } from "../src/index.js";

describe("RoomsApi", () => {
  const room = {
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
  };

  it("records emergency withdrawals with directory write auth", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(21));
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          room,
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
    expect(request.headers.get("X-Agent-ID")).toBe("@operator");
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

  it("uses request actors for player room writes", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(22));
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        const path = new URL(String(input)).pathname;
        if (path.endsWith("/action")) {
          return Response.json({
            hand: {
              handId: "hand_123",
              roomId: "room_123",
              number: 1,
              status: "preflop",
              pot: "0",
              startedAt: "2026-06-13T00:00:00Z",
            },
            action: {
              seat: 1,
              action: "check",
              createdAt: "2026-06-13T00:00:00Z",
            },
          });
        }
        if (path.endsWith("/leave")) {
          return Response.json({
            room,
            seat: 1,
            handle: "@player",
            returned: "10",
          });
        }
        return Response.json({
          room,
          seat: { seat: 1, handle: "@player", stack: "10", status: "active" },
        });
      },
    });

    await client.rooms.join("room_123", { agentId: "@player", buyIn: "10" });
    await client.rooms.action("room_123", {
      agentId: "@player",
      action: "check",
    });
    await client.rooms.leave("room_123", { agentId: "@player" });

    expect(requests.map((request) => request.headers.get("X-Agent-ID"))).toEqual(
      ["@player", "@player", "@player"],
    );
    expect(requests.map((request) => request.method)).toEqual([
      "POST",
      "POST",
      "POST",
    ]);
  });

  it("uses operator actors for room administration writes", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(23));
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        const path = new URL(String(input)).pathname;
        if (path.endsWith("/settle")) {
          return Response.json({
            handId: "hand_123",
            roomId: "room_123",
            number: 1,
            status: "settled",
            pot: "10",
            startedAt: "2026-06-13T00:00:00Z",
          });
        }
        if (path.endsWith("/hands")) {
          return Response.json({
            hand: {
              handId: "hand_123",
              roomId: "room_123",
              number: 1,
              status: "preflop",
              pot: "0",
              startedAt: "2026-06-13T00:00:00Z",
            },
          });
        }
        if (path.endsWith("/timeout")) {
          return Response.json({
            room,
            hand: {
              handId: "hand_123",
              roomId: "room_123",
              number: 1,
              status: "preflop",
              pot: "0",
              startedAt: "2026-06-13T00:00:00Z",
            },
            action: {
              seat: 1,
              action: "fold",
              createdAt: "2026-06-13T00:00:00Z",
            },
          });
        }
        return Response.json({ room, cashouts: [] });
      },
    });

    await client.rooms.close("room_123", { operator: "@operator" });
    await client.rooms.timeout("room_123", { operator: "@operator" });
    await client.rooms.startHand("room_123", { operator: "@operator" });
    await client.rooms.settleHand(
      "room_123",
      "hand_123",
      {
        operator: "@operator",
        winners: [{ seat: 1, payout: "10" }],
        txHash: "0xsettle",
      },
    );

    expect(requests.map((request) => request.headers.get("X-Agent-ID"))).toEqual(
      ["@operator", "@operator", "@operator", "@operator"],
    );
  });

  it("can authenticate room reads for player-specific hand redaction", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(24));
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        const path = new URL(String(input)).pathname;
        if (path.endsWith("/hands")) {
          return Response.json({ hands: [] });
        }
        if (path.includes("/hands/")) {
          return Response.json({
            handId: "hand_123",
            roomId: "room_123",
            number: 1,
            status: "preflop",
            pot: "0",
            startedAt: "2026-06-13T00:00:00Z",
          });
        }
        return Response.json(room);
      },
    });

    await client.rooms.get("room_123", "@player");
    await client.rooms.listHands("room_123", "@player");
    await client.rooms.getHand("room_123", "hand_123", "@player");

    expect(requests.map((request) => request.headers.get("X-Agent-ID"))).toEqual(
      ["@player", "@player", "@player"],
    );
    expect(requests.map((request) => request.method)).toEqual([
      "GET",
      "GET",
      "GET",
    ]);
  });
});
