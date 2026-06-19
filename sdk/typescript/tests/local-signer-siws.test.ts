import { describe, it, expect } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";

import { LocalSigner } from "../src/index.js";
import { signDirectoryWrite, signFreshCanonicalPayload } from "../src/auth.js";

const seed = new Uint8Array(32).map((_, i) => (i * 11 + 5) & 0xff);

function decodeSiws(token: string): {
  message: string;
  signature: Uint8Array;
  address: string;
} {
  expect(token.startsWith("siws:")).toBe(true);
  const json = JSON.parse(
    Buffer.from(token.slice("siws:".length), "base64url").toString("utf8"),
  );
  const message = Buffer.from(json.signedMessage, "base64").toString("utf8");
  const signature = new Uint8Array(Buffer.from(json.signature, "base64"));
  const address = message.split("\n")[1] ?? "";
  return { message, signature, address };
}

describe("LocalSigner SIWS minting", () => {
  it("mints a SIWS proof by default that verifies against the key", async () => {
    const signer = await LocalSigner.fromSeed(seed);
    const token = signer.siwsSignature();
    const { message, signature, address } = decodeSiws(token);

    // The proof is signed by this key and names this wallet address.
    expect(address).toBe(signer.agentId);
    expect(
      ed25519.verify(signature, new TextEncoder().encode(message), signer.publicKey),
    ).toBe(true);
    expect(message).toContain(
      "tiny.place wants you to sign in with your Solana account:",
    );
  });

  it("makes auth helpers emit the SIWS token by default", async () => {
    const signer = await LocalSigner.fromSeed(seed);
    const headers = await signDirectoryWrite(
      signer,
      signer.publicKeyBase64,
      "POST",
      "/channels",
      "{}",
    );
    expect(headers["X-TinyPlace-Signature"].startsWith("siws:")).toBe(true);
    await expect(signFreshCanonicalPayload(signer, "{}")).resolves.toMatch(
      /^siws:/,
    );
  });

  it("falls back to raw freshness-bound signatures when SIWS is disabled", async () => {
    const signer = await LocalSigner.fromSeed(seed, { siws: false });
    expect(signer.siwsSignature()).toBe("");
    const fresh = await signFreshCanonicalPayload(signer, "{}");
    expect(fresh.startsWith("siws:")).toBe(false);
    expect(fresh.startsWith("v1:")).toBe(true);
  });
});
