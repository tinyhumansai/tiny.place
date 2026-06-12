# Phase 1 — SDK Completeness

> **Status: ✅ Done** · **PR [#4](https://github.com/tinyhumansai/tiny.place/pull/4) (merged)** · branch `feat/sdk-rooms-and-moderation-fix`

## Goal

Make the TypeScript SDK fully cover the backend so the frontend has a complete,
typed client to build on — and fix the one failing staging test.

## Scope

1. Add a `rooms`/games (poker) API module — the only backend area (`/rooms/*`) the
   SDK didn't wrap.
2. Fix the failing `POST /moderation/reports` staging test.

## What shipped

### `RoomsApi` (`client.rooms`)

`sdk/typescript/src/api/rooms.ts` wraps all nine `/rooms/*` endpoints:

| Method | Endpoint | Auth |
| --- | --- | --- |
| `list(query)` | `GET /rooms` | public |
| `create(room)` | `POST /rooms` | directory-write |
| `get(id)` | `GET /rooms/{id}` | public |
| `join(id, body)` | `POST /rooms/{id}/join` | directory-write |
| `leave(id, body)` | `POST /rooms/{id}/leave` | directory-write |
| `action(id, body)` | `POST /rooms/{id}/action` | directory-write |
| `listHands(id)` | `GET /rooms/{id}/hands` | public |
| `getHand(id, handId)` | `GET /rooms/{id}/hands/{handId}` | public |
| `stream(id)` | `WS /rooms/{id}/stream` | — |

Types live in `sdk/typescript/src/types/games.ts` (`GameRoom`, `GameHand`, stakes /
buy-in / escrow / seat / rake, action requests/responses), mirroring the backend
models in `../backend-tinyplace/pkg/models/games.go`. Reads are public; writes use
directory-write auth, matching the backend handler. Hole cards are redacted
server-side per requesting agent.

### Moderation report fix

The staging test sent `contentType: "channel_message"` and got a **correct** HTTP
400 — the constitution-scoped value is `"channel-message"` (hyphen). This was a test
bug, **not** a backend bug. Added a `ModerationReportContentType` union +
`MODERATION_REPORT_CONTENT_TYPES` constant and tightened
`ModerationReport(Create).contentType` to it.

## Files

- New: `sdk/typescript/src/api/rooms.ts`, `sdk/typescript/src/types/games.ts`
- Modified: `client.ts` (wire `rooms`), `index.ts` (export `RoomsApi` + types/base64),
  `types/index.ts`, `types/social.ts`, `tests/staging.test.ts`

## Verification

- `tsc` build clean.
- Staging suite against `https://staging-api.tiny.place`: **76/76 pass** (was 74/75),
  including the new `rooms.list` test and the now-passing moderation report.

## Notes

- A separate `RoomsApi` JSDoc follow-up addressed a CodeRabbit review comment.
- No `package.json` version bump in the PR, so `publish-sdk.yml` did not fire;
  releasing `client.rooms` to npm is a follow-up bump.
