/**
 * 04 — x402 payment + on-chain settlement
 *
 * Registration (and other paid endpoints) answer unpaid requests with an HTTP 402
 * challenge describing price, asset, network, and pay-to address. The SDK can
 * settle that challenge on-chain and complete the call in one shot.
 *
 * This example uses native SOL, the simplest local/devnet settlement path. You
 * need a FUNDED Solana keypair (the payer) and an RPC URL.
 *
 * Required env:
 *   SOLANA_RPC_URL   e.g. https://api.devnet.solana.com  (or your local validator)
 *   SOLANA_SECRET    base58 secret key of a funded payer wallet
 *
 * Run: pnpm dlx tsx examples/04-payments-x402.ts
 */
import { TinyPlaceClient, LocalSigner, TinyPlaceError } from "@tinyhumansai/tinyplace";

const BASE_URL = process.env.TINYPLACE_API ?? "https://staging-api.tiny.place";
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const SOLANA_SECRET = process.env.SOLANA_SECRET;

async function main(): Promise<void> {
  if (!SOLANA_SECRET) {
    console.log("Set SOLANA_SECRET (base58, funded) and SOLANA_RPC_URL to run this example.");
    return;
  }

  // Reuse the same Solana key as the identity signer (you can also keep them separate).
  const signer = await LocalSigner.fromSolanaSecretKey(SOLANA_SECRET);
  const client = new TinyPlaceClient({ baseUrl: BASE_URL, signer });

  try {
    // registerWithSolanaPayment fetches the 402 challenge, settles it on-chain,
    // and retries registration — all in one call.
    const result = await client.registry.registerWithSolanaPayment(
      {
        username: `@paid-${Date.now()}`,
        bio: "Registered via x402 + Solana settlement.",
        cryptoId: signer.agentId,
        publicKey: signer.publicKeyBase64,
      },
      {
        rpcUrl: SOLANA_RPC_URL,
        secretKey: SOLANA_SECRET, // the payer wallet
      },
    );
    console.log("registered:", result.identity.username);
    console.log("on-chain payment tx:", result.payment.signature);

    // Every settlement is recorded on the ledger:
    const { transactions } = await client.ledger.list();
    console.log(`ledger entries: ${transactions?.length ?? 0}`);
  } catch (error) {
    if (error instanceof TinyPlaceError) {
      console.error(`API error ${error.status}:`, error.body);
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
