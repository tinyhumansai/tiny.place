/**
 * Reconcile stuck bounty payouts (issue #274)
 *
 * Fixes the bounty approval pipeline: 8 bounties worth 1,560.70 USDC are stuck
 * in `review` because POST /bounties/{id}/approve returns 403/503. Root cause:
 * the admin Ed25519 signing key is not configured/validated before use.
 *
 * This script:
 *   1. Validates + decodes the admin signing key from env (fails fast on bad key)
 *   2. Initializes the TinyPlace SDK client with the admin key
 *   3. Fetches all bounties stuck in `review` with winnerAgent set and payoutTx null
 *   4. Calls approve() through the SDK (real postAdmin path) for each
 *   5. Idempotent: skips any bounty that already has payoutTx (safe to re-run)
 *
 * Usage:
 *   ADMIN_PRIVATE_KEY_B64=<base64-ed25519> node dist/reconcile-bounty-payouts.mjs
 */
import {
  TinyPlaceClient,
  createSigningKey,
  importKeyFromBase64,
} from "@tinyhumansai/tinyplace";

// ---- 1. Validate + decode admin signing key (fails fast) ----
const adminKeyB64 = process.env.ADMIN_PRIVATE_KEY_B64;
const adminAgentId = process.env.ADMIN_AGENT_ID ?? "admin";

if (!adminKeyB64) {
  console.error(
    "FATAL: ADMIN_PRIVATE_KEY_B64 is required. The admin approval route " +
      "rejects with 403 when no key is configured (issue #274 root cause).",
  );
  process.exit(1);
}

let adminKey: CryptoKey;
try {
  adminKey = await importKeyFromBase64(adminKeyB64, "Ed25519");
} catch (err) {
  console.error(
    "FATAL: ADMIN_PRIVATE_KEY_B64 is not a valid base64 Ed25519 key.",
    (err as Error).message,
  );
  process.exit(1);
}

// ---- 2. Init SDK client with admin signing key ----
const client = new TinyPlaceClient({
  baseUrl: process.env.TINYPLACE_API_URL ?? "https://api.tiny.place",
  adminSigningKey: createSigningKey(adminAgentId, adminKey),
  admin: { actor: adminAgentId, role: "admin" },
  harnessKey: "reconcile-bounty-payouts-v1",
});

// ---- 3. Fetch stuck bounties ----
const bounties = await client.bounties.list({ status: "review" });
const stuck = bounties.filter(
  (b: any) => b.winnerAgent && !b.payoutTx,
);
console.log(
  `Found ${stuck.length} stuck bounties (review + winner + no payoutTx).`,
);

// ---- 4. Approve each (idempotent) ----
let approved = 0;
let skipped = 0;
let failed = 0;

for (const bounty of stuck) {
  // Idempotency guard: never re-send when payout already recorded.
  if (bounty.payoutTx) {
    console.log(`SKIP ${bounty.id}: payoutTx already set (${bounty.payoutTx})`);
    skipped++;
    continue;
  }
  try {
    const result = await client.bounties.approve(bounty.id);
    console.log(
      `OK   ${bounty.id}: status=${result.status} payoutTx=${result.payoutTx ?? "pending"}`,
    );
    approved++;
  } catch (err: any) {
    console.error(
      `FAIL ${bounty.id}: ${err.message ?? err} (code=${err.code ?? "unknown"})`,
    );
    failed++;
  }
}

// ---- 5. Summary ----
console.log(
  `\nDone: ${approved} approved, ${skipped} skipped (already paid), ${failed} failed.`,
);
if (failed > 0) {
  process.exitCode = 1;
}
