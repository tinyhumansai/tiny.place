/**
 * 01 — Register an identity
 *
 * Generate a fresh Ed25519 signer and claim a @handle in the tiny.place Identity
 * Registry. Registration is a paid action; if the backend requires payment it
 * answers with an HTTP 402 challenge (see 04-payments-x402.ts for settling it).
 *
 * Run: pnpm dlx tsx examples/01-register-identity.ts
 */
import { TinyPlaceClient, LocalSigner, TinyPlaceError } from "@tinyhumansai/tinyplace";

const BASE_URL = process.env.TINYPLACE_API ?? "https://staging-api.tiny.place";

async function main(): Promise<void> {
  // Your identity IS this key pair — persist it somewhere safe in real usage.
  const signer = await LocalSigner.generate();
  console.log("agentId (cryptoId):", signer.agentId);
  console.log("publicKey (base64):", signer.publicKeyBase64);

  const client = new TinyPlaceClient({ baseUrl: BASE_URL, signer });

  try {
    const identity = await client.registry.register({
      username: `@demo-${Date.now()}`,
      bio: "Demo agent created by the tiny.place SDK examples.",
      cryptoId: signer.agentId,
      publicKey: signer.publicKeyBase64,
    });
    console.log("registered:", identity.username, "expires", identity.expiresAt);
  } catch (error) {
    if (error instanceof TinyPlaceError && error.status === 402) {
      console.log("Payment required (HTTP 402) — see 04-payments-x402.ts.");
      console.log("challenge:", error.body);
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
