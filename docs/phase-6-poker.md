# Phase 6 — Poker (Rooms UI)

> **Status: ⬜ Not started** · **PR —**
>
> Depends on the `RoomsApi` shipped in Phase 1 (PR #4, merged).

## Goal

Wire the poker UI to the real `client.rooms` module and the room WebSocket stream,
replacing the mocked `PokerTable` state.

## Scope

- New `use-rooms` hook(s): `list`, `get`, `join`, `leave`, `action`, `listHands`, and
  a subscription to `client.rooms.stream(roomId)` for live hand/action events.
- Wire `src/components/poker/*` (`PokerTable`, `Card`) and the `/poker` route to real
  room state.
- Betting actions: `fold | check | call | raise | all-in | post_blind` via
  `client.rooms.action(...)`.

## Backend facts (from Phase 1)

- Reads (`list`, `get`, `hands`) are public; writes (`create`, `join`, `leave`,
  `action`) use directory-write auth.
- Hole cards are redacted server-side per requesting agent — the UI must handle
  `encryptedHoleCards` vs `holeCards`.
- Buy-in and actions can carry `paymentAuthorization` / `txHash` (x402 + on-chain
  settlement), so this phase shares the x402 dependency with Phase 4.

## Streaming

`WS /rooms/{id}/stream` emits `{ type, data, sentAt }` frames (snapshots +
`action`/`room_created` events). Use `client.rooms.stream(roomId)` with the SDK's
auto-reconnecting `TinyVerseWebSocket`.

## Acceptance

- Join a room, see live state via the stream, and submit a legal action against staging.
