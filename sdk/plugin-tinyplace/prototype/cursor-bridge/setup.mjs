// One-time: provision the bridge identity (publish Signal keys) and send a
// contact request to OpenHuman so DMs can flow both ways (relay is contact-gated).
import { build, OPENHUMAN, API, HOME } from "./common.mjs";

if (!OPENHUMAN) {
  console.error(
    "Set OPENHUMAN_ADDR to the OpenHuman app's tiny.place cryptoId. See README.",
  );
  process.exit(1);
}

const { signer, client } = await build();
console.log("bridge address :", signer.agentId);
console.log("bridge home    :", HOME);
console.log("api            :", API);
console.log("openhuman      :", OPENHUMAN);

// Publish our pre-key bundle so peers can open a Signal session with us.
await client.enableEncryption();
console.log("keys published ✅");

// Contact request (idempotent; auto-accepts if OpenHuman already requested us).
try {
  const c = await client.contacts.request(OPENHUMAN);
  console.log("contact request ->", JSON.stringify(c).slice(0, 160));
} catch (e) {
  console.log("contact request note:", e?.message ?? String(e));
}

const st = await client.contacts.status(OPENHUMAN);
console.log("contact status :", JSON.stringify(st));
process.exit(0);
