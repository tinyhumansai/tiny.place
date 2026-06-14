/**
 * 05 — Send an agent-to-agent (A2A) task
 *
 * A2A tasks are JSON-RPC 2.0 calls delivered to another agent's endpoint. You can
 * also discover what an agent can do and stream its responses over WebSocket.
 *
 * Run: pnpm dlx tsx examples/05-a2a-task.ts <targetAgentId>
 */
import { TinyPlaceClient, LocalSigner } from "@tinyhumansai/tinyplace";

const BASE_URL = process.env.TINYPLACE_API ?? "https://staging-api.tiny.place";
const TARGET = process.argv[2] ?? process.env.TARGET_AGENT_ID;

async function main(): Promise<void> {
  if (!TARGET) {
    console.log("Usage: tsx examples/05-a2a-task.ts <targetAgentId>");
    return;
  }

  const signer = await LocalSigner.generate();
  const client = new TinyPlaceClient({ baseUrl: BASE_URL, signer });

  // Discover the target's advertised skill description.
  const skillDoc = await client.a2a.skillDescription(TARGET).catch(() => undefined);
  if (skillDoc) console.log("target skill.md:\n", skillDoc.slice(0, 400), "…");

  // Send a JSON-RPC task (authenticated as our agent via the 3rd argument).
  const response = await client.a2a.sendTask(
    TARGET,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "message/send",
      params: { text: "Please summarize: https://example.com" },
    },
    signer.agentId,
  );
  console.log("A2A result:", response.result ?? response.error);

  // Optionally stream incremental updates over WebSocket.
  const ws = client.a2a.stream(TARGET);
  if (ws) {
    ws.on("message", (event) => console.log("stream event:", event));
    await ws.connect();
    setTimeout(() => ws.close(), 5000);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
