import { ed25519 } from "@noble/curves/ed25519.js";
import { describe, expect, it } from "vitest";

import {
  buildDelegatedX402PaymentMap,
  buildPayerSignedDelegatedTx,
  LocalSigner,
  SOLANA_MAINNET_NETWORK,
} from "../src/index.js";

// A fee payer of all-"1" base58 decodes to 32 zero bytes, so account index 0 of
// the assembled message must be 32 zeros — a clean check that the facilitator is
// the fee payer without needing a base58 decoder in the test.
const ZERO_FEE_PAYER = "11111111111111111111111111111111";
const PAYEE = "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee";

function mockFetch(
  calls: Array<string>,
): typeof globalThis.fetch {
  return async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { method: string };
    calls.push(body.method);
    switch (body.method) {
      case "getTokenAccountsByOwner":
        return Response.json({
          jsonrpc: "2.0",
          id: body.method,
          result: {
            value: [
              {
                pubkey:
                  calls.filter((m) => m === "getTokenAccountsByOwner").length ===
                  1
                    ? "89t6Va3uXRRzmPzfrt2VTPpGatBDFoj9gNeRVyeANKdK"
                    : "FYBkeQZniT9vpdGGFiT57gbXEYLTTbeqiVmMRLvK87rQ",
                account: {
                  data: {
                    parsed: { info: { tokenAmount: { amount: "1000000000" } } },
                  },
                },
              },
            ],
          },
        });
      case "getLatestBlockhash":
        return Response.json({
          jsonrpc: "2.0",
          id: body.method,
          result: { value: { blockhash: "11111111111111111111111111111111" } },
        });
      default:
        return Response.json(
          { jsonrpc: "2.0", id: body.method, error: { message: body.method } },
          { status: 500 },
        );
    }
  };
}

async function createSigner(): Promise<{
  secretKey: Uint8Array;
  signer: LocalSigner;
}> {
  const seed = new Uint8Array(32).fill(17);
  const signer = await LocalSigner.fromSeed(seed);
  const secretKey = new Uint8Array(64);
  secretKey.set(seed, 0);
  secretKey.set(signer.publicKey, 32);
  return { secretKey, signer };
}

describe("buildPayerSignedDelegatedTx", () => {
  it("assembles a 2-signer [computeLimit, computePrice, transferChecked] tx with the fee payer at account 0 and only the agent signature filled", async () => {
    const { secretKey, signer } = await createSigner();
    const calls: Array<string> = [];

    const wire = await buildPayerSignedDelegatedTx({
      rpcUrl: "https://solana.example.test",
      feePayer: ZERO_FEE_PAYER,
      payee: PAYEE,
      amount: "1000000",
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      decimals: 6,
      secretKey,
      fetch: mockFetch(calls),
    });

    expect(calls).toEqual([
      "getTokenAccountsByOwner",
      "getTokenAccountsByOwner",
      "getLatestBlockhash",
    ]);

    const bytes = new Uint8Array(Buffer.from(wire, "base64"));

    // Signature array: shortvec count (2), then two 64-byte slots.
    expect(bytes[0]).toBe(2);
    const feePayerSignature = bytes.slice(1, 65);
    const authoritySignature = bytes.slice(65, 129);
    const message = bytes.slice(129);

    // The fee-payer slot is empty (zeroed) for the facilitator to co-sign.
    expect(feePayerSignature.every((b) => b === 0)).toBe(true);
    // The agent's signature is valid over exactly the serialized message.
    expect(
      ed25519.verify(authoritySignature, message, signer.publicKey),
    ).toBe(true);

    // Message header: 2 required signers, 1 read-only signer, 3 read-only unsigned.
    expect(Array.from(message.slice(0, 3))).toEqual([2, 1, 3]);
    // 7 account keys; account 0 is the (all-zero) fee payer.
    expect(message[3]).toBe(7);
    expect(message.slice(4, 36).every((b) => b === 0)).toBe(true);

    // Instructions start after header(3) + count(1) + 7*32 keys + 32 blockhash.
    const instructionOffset = 3 + 1 + 7 * 32 + 32;
    expect(message[instructionOffset]).toBe(3); // three instructions
    // First instruction targets the ComputeBudget program (account index 6).
    expect(message[instructionOffset + 1]).toBe(6);
  });
});

describe("buildDelegatedX402PaymentMap", () => {
  it("folds the agent-signed wire transaction into the payment map under metadata.delegatedTx", async () => {
    const { secretKey, signer } = await createSigner();

    const payment = await buildDelegatedX402PaymentMap({
      rpcUrl: "https://solana.example.test",
      signer,
      secretKey,
      feePayer: ZERO_FEE_PAYER,
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      decimals: 6,
      payment: {
        network: SOLANA_MAINNET_NETWORK,
        asset: "USDC",
        amount: "1000000",
        to: PAYEE,
        metadata: { identity: "@agent", purpose: "registration" },
      },
      fetch: mockFetch([]),
    });

    expect(payment).toMatchObject({
      network: SOLANA_MAINNET_NETWORK,
      asset: "USDC",
      amount: "1000000",
      to: PAYEE,
      "metadata.identity": "@agent",
      "metadata.purpose": "registration",
    });
    expect(typeof payment["metadata.delegatedTx"]).toBe("string");
    expect(payment["metadata.delegatedTx"]!.length).toBeGreaterThan(0);
    expect(payment["signature"]).toBeTruthy();
  });
});
