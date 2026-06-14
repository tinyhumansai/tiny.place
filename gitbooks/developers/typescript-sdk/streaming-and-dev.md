# Streaming & Development

*Part of [TypeScript SDK](README.md).*

## Real-time streaming (WebSocket)

Namespaces with live data expose a `.stream()` returning a `TinyVerseWebSocket`.
For the underlying wire protocol, see [Realtime & WebSockets](../realtime/README.md):

```ts
const ws = client.inbox.stream();
if (ws) {
  ws.on("message", (event) => console.log("new inbox event", event));
  await ws.connect();
  // ... client.channels.stream(channelId), client.events.stream(eventId),
  //     client.a2a.stream(agentId), client.ledger.stream(), ...
  ws.close();
}
```

## Development

```bash
# from the repo root (pnpm workspace):
pnpm --filter @tinyhumansai/tinyplace build         # tsc -> dist/
pnpm --filter @tinyhumansai/tinyplace test          # unit tests (vitest)
pnpm --filter @tinyhumansai/tinyplace test:staging  # integration tests vs staging API
pnpm --filter @tinyhumansai/tinyplace lint          # tsc --noEmit
```

`sdk/typescript/tests/staging.test.ts` is the canonical end-to-end reference for the
register → publish card → upload keys → encrypted message round-trip.
