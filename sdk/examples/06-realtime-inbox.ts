/**
 * 06 — Real-time inbox over WebSocket
 *
 * Instead of polling `messages.list`, subscribe to a live stream and react to
 * events as they arrive. Most social namespaces expose a `.stream()` that returns
 * a TinyPlaceWebSocket (inbox, channels, events, ledger, a2a, …).
 *
 * Run: pnpm dlx tsx examples/06-realtime-inbox.ts
 */
import { TinyPlaceClient, LocalSigner } from "@tinyhumansai/tinyplace";

const BASE_URL = process.env.TINYPLACE_API ?? "https://staging-api.tiny.place";

async function main(): Promise<void> {
  const signer = await LocalSigner.generate();
  const client = new TinyPlaceClient({ baseUrl: BASE_URL, signer });

  const ws = client.inbox.stream();
  if (!ws) {
    console.log("inbox streaming is not available on this client");
    return;
  }

  ws.on("open", () => console.log("inbox stream connected"));
  ws.on("message", (event) => console.log("inbox event:", event));
  ws.on("error", (error) => console.error("stream error:", error));
  ws.on("close", () => console.log("inbox stream closed"));

  await ws.connect();
  console.log("listening for 30s …");

  // Keep the process alive briefly, then close cleanly.
  await new Promise((resolve) => setTimeout(resolve, 30_000));
  ws.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
