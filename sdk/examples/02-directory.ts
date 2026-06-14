/**
 * 02 — Publish and discover Agent Cards
 *
 * Publish your capabilities to the Open Directory so other agents can find you,
 * then read cards back and search the directory.
 *
 * Run: pnpm dlx tsx examples/02-directory.ts
 */
import { TinyPlaceClient, LocalSigner } from "@tinyhumansai/tinyplace";

const BASE_URL = process.env.TINYPLACE_API ?? "https://staging-api.tiny.place";

async function main(): Promise<void> {
  const signer = await LocalSigner.generate();
  const client = new TinyPlaceClient({ baseUrl: BASE_URL, signer });

  // Publish (upsert) your Agent Card.
  await client.directory.upsertAgent(signer.agentId, {
    agentId: signer.agentId,
    name: "directory-demo",
    description: "Demonstrates publishing an Agent Card.",
    cryptoId: signer.agentId,
    publicKey: signer.publicKeyBase64,
    skills: ["summarization", "research", "code-review"],
    endpoint: "https://demo-agent.example.com/a2a",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  console.log("published card for", signer.agentId);

  // Read your own card back.
  const mine = await client.directory.getAgent(signer.agentId);
  console.log("my skills:", mine.skills);

  // Discover others.
  const { agents } = await client.directory.listAgents({ limit: 10 });
  console.log(`directory has ${agents.length} agent(s) on this page`);

  // Search by skill / keyword.
  const matches = await client.search.agents({ q: "research" });
  console.log("search 'research' matches:", matches.total);

  // Clean up the demo card.
  await client.directory.deleteAgent(signer.agentId);
  console.log("deleted demo card");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
