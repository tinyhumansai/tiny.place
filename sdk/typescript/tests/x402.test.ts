import { describe, expect, it } from "vitest";
import {
  LocalSigner,
  buildCanonicalMessage,
  buildX402PaymentAuthorization,
  buildX402PaymentMap,
  buildX402PaymentPayload,
  x402AuthorizationToPaymentMap,
  type X402Authorization,
} from "../src/index.js";

const payerAddress = "7YttLkHDoVzP6pYphcCg5GkA2N4GokB3k1drpbUaW7oX";

describe("x402 helpers", () => {
  it("flattens signed authorizations into backend payment maps", () => {
    const authorization: X402Authorization = {
      scheme: "exact",
      network: "eip155:8453",
      asset: "USDC",
      amount: "5",
      from: payerAddress,
      to: "tinyplace-registry",
      nonce: "reg_nonce",
      expiresAt: "2026-06-13T00:00:00Z",
      signature: "signature",
      metadata: {
        domain: "tiny.place",
        identity: "@agent",
        publicKey: "public-key",
        purpose: "registration",
      },
    };

    expect(x402AuthorizationToPaymentMap(authorization)).toEqual({
      scheme: "exact",
      network: "eip155:8453",
      asset: "USDC",
      amount: "5",
      from: payerAddress,
      to: "tinyplace-registry",
      nonce: "reg_nonce",
      expiresAt: "2026-06-13T00:00:00Z",
      signature: "signature",
      "metadata.domain": "tiny.place",
      "metadata.identity": "@agent",
      "metadata.publicKey": "public-key",
      "metadata.purpose": "registration",
    });
  });

  it("keeps metadata sorted in canonical signing messages", () => {
    expect(
      buildCanonicalMessage({
        scheme: "exact",
        network: "eip155:8453",
        asset: "USDC",
        amount: "5",
        from: payerAddress,
        to: "tinyplace-registry",
        nonce: "reg_nonce",
        expiresAt: "2026-06-13T00:00:00Z",
        metadata: {
          purpose: "registration",
          domain: "tiny.place",
        },
      }),
    ).toContain(
      '"metadata":[{"key":"domain","value":"tiny.place"},{"key":"purpose","value":"registration"}]',
    );
  });

  it("builds signed tiny.place payment authorizations with signer defaults", async () => {
    const seed = new Uint8Array(32).fill(13);
    const seedSigner = await LocalSigner.fromSeed(seed);
    const secretKey = new Uint8Array(64);
    secretKey.set(seed, 0);
    secretKey.set(seedSigner.publicKey, 32);
    const signer = await LocalSigner.fromSolanaSecretKey(
      encodeBase58(secretKey),
    );

    const authorization = await buildX402PaymentAuthorization(signer, {
      network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      asset: "USDC",
      amount: "1000000",
      to: "tinyplace-registry",
      nonce: "nonce-for-test",
      expiresAt: "2026-06-13T00:00:00Z",
      metadata: { purpose: "registration" },
    });

    expect(authorization.from).toBe(signer.agentId);
    expect(authorization.from.startsWith("tiny")).toBe(false);
    expect(authorization.metadata).toEqual({
      domain: "tiny.place",
      publicKey: signer.publicKeyBase64,
      purpose: "registration",
    });
    expect(authorization.signature).toBeTruthy();
    expect(x402AuthorizationToPaymentMap(authorization)).toMatchObject({
      from: signer.agentId,
      "metadata.domain": "tiny.place",
      "metadata.publicKey": signer.publicKeyBase64,
      "metadata.purpose": "registration",
    });
  });

  it("uses delegated session x402 metadata when the signer provides it", async () => {
    const signer = {
      agentId: payerAddress,
      publicKeyBase64: "session-public-key",
      sign(): Uint8Array {
        return new Uint8Array([1, 2, 3]);
      },
      x402PaymentMetadata(): Record<string, string> {
        return {
          publicKey: "session-public-key",
          parentNonce: "approved-session-nonce",
        };
      },
    };

    const authorization = await buildX402PaymentAuthorization(signer, {
      network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      asset: "USDC",
      amount: "1000000",
      to: "seller",
      nonce: "nonce-for-session-test",
      expiresAt: "2026-06-13T00:00:00Z",
      metadata: { kind: "identity-listing" },
    });

    expect(authorization.metadata).toEqual({
      domain: "tiny.place",
      publicKey: "session-public-key",
      parentNonce: "approved-session-nonce",
      kind: "identity-listing",
    });
  });

  it("signs payment maps with on-chain references in metadata", async () => {
    const seed = new Uint8Array(32).fill(14);
    const seedSigner = await LocalSigner.fromSeed(seed);
    const secretKey = new Uint8Array(64);
    secretKey.set(seed, 0);
    secretKey.set(seedSigner.publicKey, 32);
    const signer = await LocalSigner.fromSolanaSecretKey(
      encodeBase58(secretKey),
    );

    const payment = await buildX402PaymentMap(signer, {
      network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      asset: "USDC",
      amount: "1",
      to: "tinyplace-registry",
      nonce: "nonce-for-map-test",
      expiresAt: "2026-06-13T00:00:00Z",
      metadata: { purpose: "registration" },
      onChainTx: "solana-signature",
    });

    expect(payment).toMatchObject({
      from: signer.agentId,
      onChainTx: "solana-signature",
      "metadata.domain": "tiny.place",
      "metadata.onChainTx": "solana-signature",
      "metadata.publicKey": signer.publicKeyBase64,
      "metadata.purpose": "registration",
    });
    expect(payment.signature).toBeTruthy();
  });

  it("signs nested payment payloads with on-chain references in metadata", async () => {
    const seed = new Uint8Array(32).fill(15);
    const seedSigner = await LocalSigner.fromSeed(seed);
    const secretKey = new Uint8Array(64);
    secretKey.set(seed, 0);
    secretKey.set(seedSigner.publicKey, 32);
    const signer = await LocalSigner.fromSolanaSecretKey(
      encodeBase58(secretKey),
    );

    const payment = await buildX402PaymentPayload(signer, {
      network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      asset: "USDC",
      amount: "1",
      to: "tinyplace-registry",
      nonce: "nonce-for-payload-test",
      expiresAt: "2026-06-13T00:00:00Z",
      metadata: { purpose: "settlement" },
      onChainTx: "solana-signature",
    });

    expect(payment.metadata).toMatchObject({
      domain: "tiny.place",
      onChainTx: "solana-signature",
      publicKey: signer.publicKeyBase64,
      purpose: "settlement",
    });
    expect(payment.signature).toBeTruthy();
  });
});

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function encodeBase58(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) + BigInt(byte);
  }

  let encoded = "";
  while (value > 0n) {
    const digit = Number(value % 58n);
    encoded = BASE58_ALPHABET[digit]! + encoded;
    value /= 58n;
  }

  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = "1" + encoded;
  }

  return encoded || "1";
}
